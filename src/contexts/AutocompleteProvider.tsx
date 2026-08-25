import { useCallback, useEffect, useRef, useState } from "react";
import { AutocompleteContext } from "../hooks/useAutocomplete";
import type { GenomicForm } from "../components/fastaGenerateForm/types";
import axios from "axios";
import { BACKEND_URL } from "../config";
import { Trie } from "data-structure-typed";

// TODO:(BA) investigate useEffect being run too often

interface AutoCompleteRegion {
    taskId: string;
    counter: number;
}
interface AutoCompleteOption {
    suggestions: string[] | null;
    active: boolean;
}

export const AutocompleteProvider = ({
    children,
}: {
    children: React.ReactNode;
}) => {
    const pollingInterval = 500; // Poll twice a second
    const [autoCompleteOptions, setAutocompleteOptions] = useState<
        Map<string, AutoCompleteOption>
    >(new Map<string, AutoCompleteOption>());
    const [regionFormMap, setRegionFormMap] = useState<
        Map<string, AutoCompleteRegion>
    >(new Map<string, AutoCompleteRegion>());
    const pollingRef = useRef<NodeJS.Timeout | null>(null);

    const getGenomicRegionGeneratorFormId = (
        genomicRegionGeneratorForm: GenomicForm
    ): string =>
        JSON.stringify({
            source: genomicRegionGeneratorForm.source,
            source_params: genomicRegionGeneratorForm.source_params,
        });

    const fetchAutocompleteRegions = useCallback(async () => {
        const toFetchRegionFormIds = [...autoCompleteOptions.entries()]
            .filter(([_, autoCompleteOption]) => autoCompleteOption.active)
            .map(([taskId, _]) => taskId);

        if (
            toFetchRegionFormIds.length === 0 ||
            toFetchRegionFormIds.every((taskId) => {
                return autoCompleteOptions.get(taskId)?.suggestions !== null;
            })
        )
            return;

        // TODO:(BA) use query here later on
        try {
            const response = await axios.post(
                BACKEND_URL + `/api/genomic/autocomplete-options`,
                toFetchRegionFormIds,
                {
                    withCredentials: true,
                }
            );

            const readyAutocompleteOptions: Record<string, string[]> =
                response.data;

            Object.entries(readyAutocompleteOptions).forEach(
                ([taskId, suggestions]) => {
                    setAutocompleteOptions(
                        new Map(
                            autoCompleteOptions.set(taskId, {
                                suggestions: suggestions,
                                active: autoCompleteOptions.get(taskId)!.active,
                            })
                        )
                    );
                }
            );
        } catch (error) {
            console.error("Could not fetch required autocomplete parameters");
            console.error(error);
        }
    }, [autoCompleteOptions, setAutocompleteOptions]);

    const updateAutoCompleteOptions = (taskIds: string[]) => {
        const activeTaskIdsSet = new Set(taskIds);
        const allTaskIds = new Set([...taskIds, ...autoCompleteOptions.keys()]);

        allTaskIds.forEach((taskId) => {
            const autoCompleteOption = autoCompleteOptions.get(taskId);
            const suggestions =
                autoCompleteOption?.suggestions !== undefined
                    ? autoCompleteOption.suggestions
                    : null;
            const active = activeTaskIdsSet.has(taskId);

            autoCompleteOptions.set(taskId, {
                suggestions,
                active,
            });
        });

        setAutocompleteOptions(new Map(autoCompleteOptions));
    };

    const setAutoCompleteRegions = (
        genomicRegionGeneratorForms: GenomicForm[]
    ) => {
        const activeTaskIds = genomicRegionGeneratorForms
            .map(
                (genomicRegionGeneratorForm) =>
                    regionFormMap.get(
                        getGenomicRegionGeneratorFormId(
                            genomicRegionGeneratorForm
                        )
                    )?.taskId
            )
            .filter((taskId) => taskId !== undefined);

        const toFetchGenomicRegionGeneratorForms =
            genomicRegionGeneratorForms.filter(
                (genomicRegionGeneratorForm) =>
                    !regionFormMap.has(
                        getGenomicRegionGeneratorFormId(
                            genomicRegionGeneratorForm
                        )
                    )
            );

        if (toFetchGenomicRegionGeneratorForms.length > 0) {
            axios
                .post(
                    BACKEND_URL + `/api/genomic/autocomplete-region`,
                    toFetchGenomicRegionGeneratorForms,
                    {
                        withCredentials: true,
                    }
                )
                .then((response) => {
                    const taskIds: string[] = response.data;

                    for (const [index, taskId] of taskIds.entries()) {
                        regionFormMap.set(
                            getGenomicRegionGeneratorFormId(
                                toFetchGenomicRegionGeneratorForms[index]
                            ),
                            {
                                taskId: taskId,
                                counter: 1,
                            }
                        );
                    }

                    setRegionFormMap(new Map(regionFormMap));

                    updateAutoCompleteOptions([...activeTaskIds, ...taskIds]);
                })
                .catch((error) => {
                    console.error(
                        "Something went wrong while preparing the autocompletion"
                    );
                    console.error(error);
                });
            return;
        }

        updateAutoCompleteOptions(activeTaskIds);
    };

    useEffect(() => {
        pollingRef.current = setInterval(
            () => fetchAutocompleteRegions(),
            pollingInterval
        );

        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
            }
        };
    }, [fetchAutocompleteRegions]);

    const validSuggestions = [...autoCompleteOptions.values()]
        .filter((val) => val.active && val.suggestions !== null)
        .map((val) => val.suggestions!);

    const readyAutoCompletOptions = Array<string>().concat(...validSuggestions);

    return (
        <AutocompleteContext.Provider
            value={{
                setAutoCompleteRegions,
                autoCompleteOptions: new Trie(readyAutoCompletOptions),
            }}
        >
            {children}
        </AutocompleteContext.Provider>
    );
};
