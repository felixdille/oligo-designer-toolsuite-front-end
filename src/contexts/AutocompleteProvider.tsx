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

interface AutoCompleteOptionAnswer {
    task_id: string;
    autocomplete_options: string[];
}

export const AutocompleteProvider = ({
    children,
}: {
    children: React.ReactNode;
}) => {
    const [autoCompleteOptions, setAutocompleteOptions] = useState(
        new Map<string, AutoCompleteOption>()
    );
    const [regionFormMap, setRegionFormMap] = useState(
        new Map<string, AutoCompleteRegion>()
    );
    const eventSourceRef = useRef<EventSource | null>(null);

    const getGenomicRegionGeneratorFormId = (
        genomicRegionGeneratorForm: GenomicForm
    ): string =>
        JSON.stringify({
            source: genomicRegionGeneratorForm.source,
            source_params: genomicRegionGeneratorForm.source_params,
        });

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
        const SSE_STREAM_URL = BACKEND_URL + "/api/stream";

        if (
            !eventSourceRef.current ||
            eventSourceRef.current.readyState != EventSource.OPEN
        ) {
            eventSourceRef.current = new EventSource(SSE_STREAM_URL, {
                withCredentials: true,
            });

            eventSourceRef.current.onerror = () => {
                console.error("Event Source encountered an error");
            };
        }

        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
            }
        };
    }, []);

    useEffect(() => {
        const eventSource = eventSourceRef.current;

        if (!eventSource) {
            console.error("Could not initialize event stream");
            return;
        }

        const listener = (ev: MessageEvent<any>) => {
            const autoCompleteAnswer: AutoCompleteOptionAnswer = JSON.parse(
                ev["data"]
            );

            const taskId = autoCompleteAnswer.task_id;

            setAutocompleteOptions(
                new Map(
                    autoCompleteOptions.set(taskId, {
                        suggestions: autoCompleteAnswer.autocomplete_options,
                        active: autoCompleteOptions.get(taskId)!.active,
                    })
                )
            );
        };

        eventSource.addEventListener("autocomplete-options", listener);

        return () => {
            eventSource.removeEventListener("autocomplete-options", listener);
        };
    }, [autoCompleteOptions, setAutocompleteOptions]);

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
