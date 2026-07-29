import { useCallback, useEffect, useRef, useState } from "react";
import { AutocompleteContext } from "../hooks/useAutocomplete";
import type {
    EnsemblGenomicForm,
    NcbiGenomicForm,
} from "../components/fastaGenerateForm/types";
import axios from "axios";
import { BACKEND_URL } from "../config";

export const AutocompleteProvider = ({
    children,
}: {
    children: React.ReactNode;
}) => {
    const pollingInterval = 10000; // Poll every second
    const [regionFormIds, setRegionFormIds] = useState<string[]>([]);
    const [autoCompleteOptions, setAutocompleteOptions] = useState<
        Map<string, string[]>
    >(new Map<string, string[]>());
    const pollingRef = useRef<NodeJS.Timeout | null>(null);

    // TODO:(BA) check how error handling could be improved here
    const addAutocompleteRegion = (
        genomicRegionGeneratorForm: NcbiGenomicForm | EnsemblGenomicForm
    ) => {
        axios
            .post(
                BACKEND_URL + `/api/genomic/autocomplete-region`,
                genomicRegionGeneratorForm,
                {
                    withCredentials: true,
                }
            )
            .then((response) => {
                setRegionFormIds([...regionFormIds, response.data]);
            })
            .catch((error) => {
                console.error(
                    "Something went wrong while preparing the autocompletion"
                );
                console.error(error);
            });
    };

    const fetchAutocompleteRegions = useCallback(
        async (regionFormIds: string[]) => {
            if (
                regionFormIds.length === 0 ||
                regionFormIds.every((regionFormId) =>
                    autoCompleteOptions.has(regionFormId)
                )
            )
                return;

            // TODO:(BA) use query here later on
            try {
                const response = await axios.post(
                    BACKEND_URL + `/api/genomic/autocomplete-options`,
                    regionFormIds,
                    {
                        withCredentials: true,
                    }
                );

                const readyAutocompleteOptions: Record<string, string[]> =
                    response.data;
                Object.entries(readyAutocompleteOptions).forEach(
                    ([key, value]) => {
                        if (!autoCompleteOptions.has(key)) {
                            setAutocompleteOptions(
                                new Map<string, string[]>(
                                    autoCompleteOptions
                                        .set(key, value)
                                        .entries()
                                )
                            );
                        }
                    }
                );
            } catch (error) {
                console.error(
                    "Could not fetch required autocomplete parameters"
                );
                console.error(error);
            }
        },
        [autoCompleteOptions, setAutocompleteOptions]
    );

    useEffect(() => {
        fetchAutocompleteRegions(regionFormIds); // Initial poll on component mount

        pollingRef.current = setInterval(
            () => fetchAutocompleteRegions(regionFormIds),
            pollingInterval
        );

        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
            }
        };
    }, [fetchAutocompleteRegions, regionFormIds]);

    return (
        <AutocompleteContext.Provider
            value={{
                addAutocompleteRegion,
                autoCompleteOptions: Array<string>().concat(
                    ...autoCompleteOptions.values()
                ),
            }}
        >
            {children}
        </AutocompleteContext.Provider>
    );
};
