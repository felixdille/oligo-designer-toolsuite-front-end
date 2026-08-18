import type { ErrorSchema, FieldPathId, FieldPathList } from "@rjsf/utils";
import { Form, ListGroup } from "react-bootstrap";
import "./AutoCompleteTxtInput.css";
import { useAutoComplete } from "../../hooks/useAutocomplete";
import { memo, useState } from "react";

interface AutoCompleteTxtInputProps {
    allGenesChecked: boolean;
    fieldPathId: FieldPathId;
    formData: any;
    onChange: (
        newValue: any,
        path: FieldPathList,
        es?: ErrorSchema<any> | undefined,
        id?: string
    ) => void;
    onBlur: (id: string, value: any) => void;
}

//TODO:(BA) investigate if memo and this component is really necessary
export const AutoCompleteListItem: React.FC<{
    option: string;
    index: number;
    setValue: React.Dispatch<any>;
}> = memo(({ option, index, setValue }) => {
    return (
        <ListGroup.Item
            className="autocomplete-genes-list-group-item border-0"
            onClick={() => setValue(option)}
            key={index}
        >
            {option}
        </ListGroup.Item>
    );
});

export const AutoCompleteTxtInput: React.FC<AutoCompleteTxtInputProps> = ({
    allGenesChecked,
    fieldPathId,
    formData,
    onChange,
    onBlur,
}) => {
    const [currentOptions, setCurrentOptions] = useState<string[]>([]);
    const [value, setValue] = useState(formData || "");

    const { autoCompleteOptions } = useAutoComplete();

    const emptyStringToUndefined = (value: string) =>
        value === "" ? undefined : value;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const input = e.target.value;

        setValue(input);

        const matchingOptions = autoCompleteOptions.getWords(input, 20);
        setCurrentOptions(matchingOptions);

        onChange(emptyStringToUndefined(input), fieldPathId.path);
    };

    return (
        <Form.Group className="autocomplete-genes-form-group flex-grow-1 flex-shrink-1">
            <Form.Control
                disabled={allGenesChecked}
                id={fieldPathId.$id}
                onBlur={() => onBlur(fieldPathId.$id, formData)}
                type="input"
                onChange={handleChange}
                value={value}
                autoComplete="off"
                className="rounded-0"
            />
            {currentOptions && currentOptions.length > 0 && value !== "" && (
                <ListGroup className="rounded-top-0 autocomplete-genes-list-group border-black">
                    {currentOptions.map((option, index) => (
                        <AutoCompleteListItem
                            option={option}
                            setValue={setValue}
                            index={index}
                        />
                    ))}
                </ListGroup>
            )}
        </Form.Group>
    );
};
