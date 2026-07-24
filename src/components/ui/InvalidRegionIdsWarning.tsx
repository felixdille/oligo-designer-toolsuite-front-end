import { useCallback, useEffect, useState } from "react";
import { BACKEND_URL } from "../../config";
import axios from "axios";
import { Alert } from "react-bootstrap";

interface InvalidRegionWarningProps {
    id: string;
}

/**
 * Renders a warning that displays all invalid Region Ids
 * 
 * @param id - unique ID of the pipeline run
 * @returns A React Component rendering a warning that includes all invalid Region Ids
 */
export const InvalidRegionWarning: React.FC<InvalidRegionWarningProps> = ({
    id,
}) => {
    const [invalidRegionIds, setInvalidRegionIds] = useState<string[] | null>();

    const fetchInvalidRegionIds = useCallback((id: string) => {
        axios
            .get(BACKEND_URL + `/api/runs/${id}/invalid-ids`, {
                withCredentials: true,
                responseType: "json",
            })
            .then((response) => {
                console.log(response.data);
                setInvalidRegionIds(response.data);
            })
            .catch((error) => {
                console.error(
                    `Could not retrieve invalid Region Ids: ${error}`
                );
                setInvalidRegionIds(null);
            });
    }, []);

    useEffect(() => {
        fetchInvalidRegionIds(id);
    }, [id, fetchInvalidRegionIds]);

    console.log(invalidRegionIds?.length);

    return invalidRegionIds && invalidRegionIds.length > 0 ? (
        <Alert variant="warning">
            There are <b>invalid Region Ids</b> in your input:
            {` ${invalidRegionIds.join(", ")}`}
        </Alert>
    ) : (
        <></>
    );
};
