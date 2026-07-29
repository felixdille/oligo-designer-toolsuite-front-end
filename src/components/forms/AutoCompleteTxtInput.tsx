import type { ErrorSchema, FieldPathId, FieldPathList } from "@rjsf/utils";
import { Form, ListGroup } from "react-bootstrap";
import "./AutoCompleteTxtInput.css";
import { useAutoComplete } from "../../hooks/useAutocomplete";
import { useState } from "react";

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

        const matchingOptions = autoCompleteOptions.filter((s) =>
            s.startsWith(input)
        );

        setCurrentOptions(matchingOptions);

        onChange(emptyStringToUndefined(input), fieldPathId.path);
    };

    return (
        <Form.Group className="autocomplete-genes-form-group">
            <Form.Control
                disabled={allGenesChecked}
                id={fieldPathId.$id}
                onBlur={() => onBlur(fieldPathId.$id, formData)}
                type="input"
                onChange={handleChange}
                value={value}
                autoComplete="off"
            />
            {currentOptions && currentOptions.length > 0 && value !== "" && (
                <ListGroup className="autocomplete-genes-list-group">
                    {currentOptions.map((option, index) => (
                        <ListGroup.Item
                            className="autocomplete-genes-list-group-item"
                            onClick={() => setValue(option)}
                            key={index}
                        >
                            {option}
                        </ListGroup.Item>
                    ))}
                </ListGroup>
            )}
        </Form.Group>
    );
};
