import { useCallback, useEffect, useRef, useState } from "react";
import { AutocompleteContext } from "../hooks/useAutocomplete";
import type { GenomicForm } from "../components/fastaGenerateForm/types";
import axios from "axios";
import { BACKEND_URL } from "../config";
import { Trie } from "data-structure-typed";

// TODO:(BA) investigate useEffect being run too often

interface AutoCompleteRegion {
    suggestions: string[] | null;
    active: boolean;
}
type NewRegionResponse = Record<
    string,
    { state: "miss"; task_id: string } | { state: "hit"; suggestions: string[] }
>;

interface AutoCompleteOptionAnswer {
    task_id: string;
    autocomplete_options: string[];
    status: "update" | "cached";
}

export const AutocompleteProvider = ({
    children,
}: {
    children: React.ReactNode;
}) => {
    const [autoCompleteOptions, setAutocompleteOptions] = useState(
        new Map<string, string>()
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

    const updateAutoCompleteOptions = (
        genomicRegionGeneratorForms: GenomicForm[],
        fetchedRegionIdMap: NewRegionResponse | null
    ) => {
        const activeRegionIds = new Set(
            genomicRegionGeneratorForms.map(getGenomicRegionGeneratorFormId)
        );

        const activeRegionsMap = [...regionFormMap.entries()].map(
            ([key, value]) => [
                key,
                {
                    suggestions: value.suggestions,
                    active: activeRegionIds.has(key),
                },
            ]
        );

        const newRegions: (string | AutoCompleteRegion)[][] = [];
        const newTaskIds: (string | AutoCompleteRegion)[][] = [];

        if (fetchedRegionIdMap) {
            Object.entries(fetchedRegionIdMap).forEach(([key, value]) => {
                if (value.state === "hit") {
                    newRegions.push([
                        key,
                        { suggestions: value.suggestions, active: true },
                    ]);
                } else {
                    newRegions.push([key, { suggestions: null, active: true }]);
                    newTaskIds.push([value.task_id, key]);
                }
            });

            setAutocompleteOptions(
                new Map([...autoCompleteOptions.entries(), ...newTaskIds] as [
                    string,
                    string,
                ][])
            );
        }

        setRegionFormMap(
            new Map(
                activeRegionsMap.concat(newRegions) as [
                    string,
                    AutoCompleteRegion,
                ][]
            )
        );
    };

    const setAutoCompleteRegions = (
        genomicRegionGeneratorForms: GenomicForm[]
    ) => {
        const newGenomicRegionGeneratorFormTuples =
            genomicRegionGeneratorForms.map((genomicRegionGeneratorForm) => [
                getGenomicRegionGeneratorFormId(genomicRegionGeneratorForm),
                genomicRegionGeneratorForm,
            ]);

        const newGenomicRegionGeneratorForms = new Set(
            newGenomicRegionGeneratorFormTuples.filter(
                ([id]) => !regionFormMap.has(id as string)
            )
        );

        if (newGenomicRegionGeneratorForms.size > 0) {
            axios
                .post(
                    BACKEND_URL + `/api/genomic/autocomplete-region`,
                    [...newGenomicRegionGeneratorForms.values()],
                    {
                        withCredentials: true,
                    }
                )
                .then((response) => {
                    const taskIds: NewRegionResponse = response.data;

                    setRegionFormMap(new Map(regionFormMap));

                    updateAutoCompleteOptions(
                        genomicRegionGeneratorForms,
                        taskIds
                    );
                })
                .catch((error) => {
                    console.error(
                        "Something went wrong while preparing the autocompletion"
                    );
                    console.error(error);
                });
            return;
        }

        updateAutoCompleteOptions(genomicRegionGeneratorForms, null);
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

            const regionFormId = autoCompleteOptions.get(taskId);

            if (!regionFormId || regionFormId === undefined) {
                console.error("Missing region form");
                return;
            }

            const active = regionFormMap.get(regionFormId)?.active;

            const currentSuggestions =
                regionFormMap.get(regionFormId)?.suggestions;

            if (
                autoCompleteAnswer.status === "cached" &&
                currentSuggestions !== undefined &&
                currentSuggestions !== null
            ) {
                return;
            }

            setRegionFormMap(
                new Map(
                    regionFormMap.set(regionFormId, {
                        suggestions: autoCompleteAnswer.autocomplete_options,
                        active: active === undefined ? false : active,
                    })
                )
            );
        };

        eventSource.addEventListener("autocomplete-options", listener);

        return () => {
            eventSource.removeEventListener("autocomplete-options", listener);
        };
    }, [autoCompleteOptions, setRegionFormMap, regionFormMap]);

    const validSuggestions = [...regionFormMap.values()]
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
