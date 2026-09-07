import type { GenomicForm } from "./types";
import { FilePreview, GenomicFormPreview } from "./InputPreviews";
import { SelectedItemList } from "../ui/SelectedItemComponents";

/**
 * Discriminated Union Type that describes possible entries of the InputList for the Genomic Region Input
 */
type InputListItem =
    | {
          type: "form";
          data: GenomicForm;
          editHandler: () => void;
          removeHandler: () => void;
      }
    | {
          type: "file";
          data: File;
          removeHandler: () => void;
      };

interface InputListProps {
    id: string;
    inputs: InputListItem[];
}

/**
 * Renders a list of Buttons which serve as short previews for the
 * selected Genomic Input (e.g. files, Genomic Region Generator Forms)
 * and as the way to open the corresponding edit menus.
 *
 * @param id - unique ID of the `InputList` Component
 * @param inputs - the current inputs of the Genomic Input Field
 * @returns A React Component rendering a List of Buttons to view
 * and edit Genomic Input
 */
export const InputList = ({ id, inputs }: InputListProps) => {
    const selectedItems = inputs.map((input) => ({
        preview:
            input.type === "form"
                ? GenomicFormPreview(input.data as GenomicForm)
                : FilePreview(input.data as File),
        removeHandler: input.removeHandler,
        changeHandler: input.type === "form" ? input.editHandler : undefined,
    }));

    return (
        <SelectedItemList
            selectedItems={selectedItems}
            id={id}
            removeToolTip="Remove Region"
        />
    );
};
