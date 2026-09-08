import { useState, type ChangeEvent } from "react";
import type { FieldProps } from "@rjsf/utils";
import { Alert, Form, InputGroup } from "react-bootstrap";
import { FiletypeTxt } from "react-bootstrap-icons";
import { ToolTip } from "../ui/Tooltip";
import { AutoCompleteTxtInput } from "./AutoCompleteTxtInput";
import { useAutoComplete } from "../../hooks/useAutocomplete";
import { SelectedRegionIdsList } from "../ui/SelectedItemComponents";

/**
 * Renders a custom field, that allows users to input text or a file to input their desired gene targets.
 * Further it allows clicking a button to select all genes.
 *
 * @param props - FieldTemplateProps passed by RJSF (see {@link https://rjsf-team.github.io/react-jsonschema-form/docs/advanced-customization/custom-templates/#fieldtemplate})
 * @returns A React Component which accepts various ways of input to select the desired gene targets
 */
const TxtUploadInput = (props: FieldProps) => {
    const {
        onChange,
        fieldPathId,
        formData,
        onBlur,
        schema,
        uiSchema,
        rawErrors,
        registry,
    } = props;

    const {
        templates: { FieldErrorTemplate },
    } = registry;

    const allGenesChecked = formData === null;

    const { isLoading } = useAutoComplete();

    const [savedRegionIds, setSavedRegionIds] = useState<string[]>([]);

    const rawRegionIds: string[] = formData
        ? formData
              .split(",")
              .map((regionId: string) => regionId.trim())
              .filter((regionId: string) => regionId)
        : [];

    const regionIds = [...new Set(rawRegionIds).values()];

    const removeRegionId = (idx: number) => () => {
        regionIds.splice(idx, 1);
        onChange(regionIds.join(", "), fieldPathId.path);
    };

    const prepareRegionIdsForFormData = (regionIds: string[]) =>
        [...new Set([...regionIds]).values()].join(", ");

    const removeAllRegionIds = () => {
        onChange(undefined, fieldPathId.path);
    };

    const addRegionIds = (newRegionIds: string[]) => {
        onChange(
            prepareRegionIdsForFormData([...regionIds, ...newRegionIds]),
            fieldPathId.path
        );
    };

    const addRegionId = (regionId: string) => addRegionIds([regionId]);

    const handleTxtUpload = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const text = event.target?.result as string;
                // add string array computed from multi line separated Gene Ids in file
                addRegionIds(
                    text
                        .split("\n")
                        .map((line) => line.trim())
                        .filter((line) => line)
                );
            };
            reader.readAsText(file);
            e.target.value = ""; // reset file input
        }
        onBlur(fieldPathId.$id, formData);
    };

    const handleCheckboxChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSavedRegionIds(regionIds);
            onChange(null, fieldPathId.path);
        } else if (formData === null) {
            onChange(
                savedRegionIds.length > 0
                    ? prepareRegionIdsForFormData(savedRegionIds)
                    : undefined,
                fieldPathId.path
            );
        }
    };

    return (
        <>
            <Form.Label htmlFor={fieldPathId.$id} className="super-label mb-1">
                Region Ids
                {schema.description && (
                    <ToolTip id={fieldPathId.$id} tip={schema.description} />
                )}
            </Form.Label>
            {isLoading && (
                <Alert variant="warning">
                    Loading Region Id suggestions...
                </Alert>
            )}
            <SelectedRegionIdsList
                removeAllHandler={removeAllRegionIds}
                removeHandler={removeRegionId}
                selectedRegionIds={regionIds}
                id={fieldPathId.$id}
            />
            <InputGroup className="d-flex">
                <InputGroup.Checkbox
                    checked={allGenesChecked}
                    onChange={handleCheckboxChange}
                    className="mt-0"
                    aria-label="Checkbox for following text input"
                />
                <InputGroup.Text className="border-start-0 ps-0">
                    Use all genes
                </InputGroup.Text>
                <AutoCompleteTxtInput
                    allGenesChecked={allGenesChecked}
                    fieldPathId={fieldPathId}
                    formData={formData}
                    onBlur={onBlur}
                    addRegionId={addRegionId}
                />
                <Form.Control
                    type="file"
                    accept=".txt"
                    className="visually-hidden"
                    id="txt-upload"
                    name="txt-upload"
                    onChange={handleTxtUpload}
                />
                <Form.Label
                    htmlFor="txt-upload"
                    className="btn btn-outline-border filled mb-0"
                >
                    File Upload
                    <FiletypeTxt size={20} className="ms-2" />
                </Form.Label>
            </InputGroup>
            <FieldErrorTemplate
                schema={schema}
                uiSchema={uiSchema}
                fieldPathId={fieldPathId}
                errors={rawErrors}
                registry={registry}
            />
        </>
    );
};

export default TxtUploadInput;
