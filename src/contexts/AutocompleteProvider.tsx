import { useCallback, useEffect, useRef, useState } from "react";
import { AutocompleteContext } from "../hooks/useAutocomplete";
import type { GenomicForm } from "../components/fastaGenerateForm/types";
import axios from "axios";
import { BACKEND_URL } from "../config";

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
    const pollingInterval = 2000; // Poll every second
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

    // TODO:(BA) check how error handling could be improved here
    const addAutocompleteRegion = (genomicRegionGeneratorForm: GenomicForm) => {
        const genomicRegionGeneratorFormId = getGenomicRegionGeneratorFormId(
            genomicRegionGeneratorForm
        );

        const taskId = regionFormMap.get(genomicRegionGeneratorFormId)?.taskId;
        const counter = regionFormMap.get(
            genomicRegionGeneratorFormId
        )?.counter;

        if (taskId && counter !== undefined) {
            setRegionFormMap(
                new Map(
                    regionFormMap.set(genomicRegionGeneratorFormId, {
                        taskId: taskId,
                        counter: counter + 1,
                    })
                )
            );
            setAutocompleteOptions(
                new Map(
                    autoCompleteOptions.set(taskId, {
                        ...autoCompleteOptions.get(taskId)!,
                        active: true,
                    })
                )
            );
            return;
        }

        axios
            .post(
                BACKEND_URL + `/api/genomic/autocomplete-region`,
                genomicRegionGeneratorForm,
                {
                    withCredentials: true,
                }
            )
            .then((response) => {
                const taskId: string = response.data;

                setRegionFormMap(
                    new Map(
                        regionFormMap.set(genomicRegionGeneratorFormId, {
                            taskId: taskId,
                            counter: 1,
                        })
                    )
                );

                setAutocompleteOptions(
                    new Map(
                        autoCompleteOptions.set(taskId, {
                            suggestions: null,
                            active: true,
                        })
                    )
                );
            })
            .catch((error) => {
                console.error(
                    "Something went wrong while preparing the autocompletion"
                );
                console.error(error);
            });
    };

    const removeAutoCompleteRegion = (
        genomicRegionGeneratorForm: GenomicForm
    ) => {
        const genomicRegionGeneratorFormId = getGenomicRegionGeneratorFormId(
            genomicRegionGeneratorForm
        );

        const taskId = regionFormMap.get(genomicRegionGeneratorFormId)?.taskId;

        if (!taskId) return;

        const counter = regionFormMap.get(
            genomicRegionGeneratorFormId
        )?.counter;

        if (counter !== undefined) {
            setRegionFormMap(
                new Map(
                    regionFormMap.set(genomicRegionGeneratorFormId, {
                        taskId: taskId,
                        counter: counter > 0 ? counter - 1 : 0,
                    })
                )
            );

            if (counter > 1) return;
        }

        setAutocompleteOptions(
            new Map(
                autoCompleteOptions.set(taskId, {
                    ...autoCompleteOptions.get(taskId)!,
                    active: false,
                })
            )
        );
    };

    const fetchAutocompleteRegions = useCallback(async () => {
        const toFetchRegionFormIds = [...autoCompleteOptions.entries()]
            .filter(([_, autoCompleteOption]) => autoCompleteOption.active)
            .map(([taskId, _]) => taskId);

        if (
            toFetchRegionFormIds.length === 0 ||
            toFetchRegionFormIds.every(
                (taskId) =>
                    autoCompleteOptions.get(taskId)?.suggestions !== null
            )
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
                                active: true,
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

    return (
        <AutocompleteContext.Provider
            value={{
                addAutocompleteRegion,
                autoCompleteOptions: Array<string>().concat(
                    ...validSuggestions
                ),
                removeAutoCompleteRegion,
            }}
        >
            {children}
        </AutocompleteContext.Provider>
    );
};
