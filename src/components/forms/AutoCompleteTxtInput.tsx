import type { FieldPathId } from "@rjsf/utils";
import { Form, ListGroup, Stack } from "react-bootstrap";
import "./AutoCompleteTxtInput.css";
import { useAutoComplete } from "../../hooks/useAutocomplete";
import { memo, useState } from "react";
import Pulse from "../ui/Pulse";

interface AutoCompleteTxtInputProps {
    allGenesChecked: boolean;
    fieldPathId: FieldPathId;
    formData: any;
    onBlur: (id: string, value: any) => void;
    addRegionIds: (regionIds: string[]) => void;
}

export const AutoCompleteListItem: React.FC<{
    option: string;
    handleClick: React.Dispatch<any>;
}> = memo(({ option, handleClick }) => (
    <ListGroup.Item
        className="autocomplete-genes-list-group-item border-0"
        onMouseDown={async () => handleClick(option)}
        key={option}
    >
        {option}
    </ListGroup.Item>
));

export const AutoCompleteTxtInput: React.FC<AutoCompleteTxtInputProps> = ({
    allGenesChecked,
    fieldPathId,
    formData,
    onBlur,
    addRegionIds,
}) => {
    const [currentOptions, setCurrentOptions] = useState<string[]>([]);
    const [value, setValue] = useState(formData ? (formData as string) : "");
    const [shouldShow, setShouldShow] = useState(false);

    const { autoCompleteOptions, isLoading } = useAutoComplete();

    const MAX_SUGGESTIONS_SHOWN = 10;

    const addRegionIdsAndClearInput = (regionIds: string[]) => {
        addRegionIds(regionIds);
        setValue("");
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const input = e.target.value;

        setValue(input);

        const matchingOptions = autoCompleteOptions.getWords(
            input,
            MAX_SUGGESTIONS_SHOWN,
            true
        );
        setCurrentOptions(matchingOptions);

        if (input.includes(",")) {
            const regionIds = input
                .split(",")
                .map((regionId) => regionId.trim())
                .filter((regionId) => regionId);
            addRegionIdsAndClearInput(regionIds);
        }
    };

    return (
        <>
            <Form.Group className="autocomplete-genes-form-group flex-grow-1 flex-shrink-1">
                <Form.Control
                    disabled={allGenesChecked}
                    id={fieldPathId.$id}
                    onBlur={() => {
                        onBlur(fieldPathId.$id, formData);
                        setShouldShow(false);
                    }}
                    type="input"
                    onChange={handleChange}
                    value={value}
                    autoComplete="off"
                    className="rounded-0"
                    onFocus={() => {
                        setShouldShow(true);
                        setCurrentOptions(
                            autoCompleteOptions.getWords(
                                value,
                                MAX_SUGGESTIONS_SHOWN,
                                true
                            )
                        );
                    }}
                    onKeyDown={(event) => {
                        switch (event.key) {
                            case "Enter":
                                addRegionIdsAndClearInput([value]);
                                break;
                        }
                    }}
                />
                {shouldShow && (
                    <ListGroup className="rounded-top-0 autocomplete-genes-list-group border-black">
                        {isLoading && (
                            <ListGroup.Item
                                className="border-0 align-vertical"
                                key={"loadingWidget"}
                            >
                                <Stack
                                    direction="horizontal"
                                    gap={2}
                                    className=""
                                >
                                    <Pulse size={20} color={"#004a67"} />
                                    <span className="align-middle">
                                        Loading Region Ids...
                                    </span>
                                </Stack>
                            </ListGroup.Item>
                        )}
                        {currentOptions &&
                            currentOptions.length > 0 &&
                            currentOptions.map((option) => (
                                <AutoCompleteListItem
                                    option={option}
                                    handleClick={(option) =>
                                        addRegionIdsAndClearInput([option])
                                    }
                                />
                            ))}
                    </ListGroup>
                )}
            </Form.Group>
        </>
    );
};
