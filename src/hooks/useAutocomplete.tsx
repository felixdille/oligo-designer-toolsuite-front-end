import { createContext, useContext } from "react";
import type {
    EnsemblGenomicForm,
    NcbiGenomicForm,
} from "../components/fastaGenerateForm/types";

interface AutocompleteContextType {
    autoCompleteOptions: string[];
    addAutocompleteRegion: (
        genomicRegionGeneratorForm: NcbiGenomicForm | EnsemblGenomicForm
    ) => void;
}

export const AutocompleteContext = createContext<AutocompleteContextType>(
    {} as AutocompleteContextType
);

export const useAutoComplete = () => useContext(AutocompleteContext);
