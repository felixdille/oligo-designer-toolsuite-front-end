import { useState } from "react";
import { Button, Container, InputGroup, Stack } from "react-bootstrap";
import { ArrowLeft, ArrowRight, Trash } from "react-bootstrap-icons";

interface SelectedItem {
    preview: string;
    removeHandler: () => void;
    changeHandler?: () => void;
    id: string;
    removeToolTip: string;
}

export const SelectedItem = ({
    preview,
    changeHandler,
    removeHandler,
    id,
    removeToolTip,
}: SelectedItem) => (
    <InputGroup key={id} className="flex-nowrap">
        <Button
            variant="outline-border filled text-black"
            className="flex-grow-1"
            onClick={changeHandler}
        >
            {preview}
        </Button>
        <Button
            variant="outline-border filled"
            onClick={removeHandler}
            title={removeToolTip}
        >
            <Trash />
        </Button>
    </InputGroup>
);

interface SelectedItemListProps {
    selectedItems: Omit<SelectedItem, "id" | "removeToolTip">[];
    id: string;
    removeToolTip: string;
}

export const SelectedItemList = ({
    selectedItems,
    id,
    removeToolTip,
}: SelectedItemListProps) =>
    selectedItems.map((selectedItem, idx) => (
        <SelectedItem
            id={`${id} ${idx}`}
            preview={selectedItem.preview}
            removeHandler={selectedItem.removeHandler}
            removeToolTip={removeToolTip}
            changeHandler={selectedItem.changeHandler}
        />
    ));

interface SelectedRegionIdsList {
    selectedRegionIds: string[];
    removeHandler: (idx: number) => () => void;
    id: string;
    removeAllHandler: () => void;
}

export const SelectedRegionIdsList = ({
    selectedRegionIds,
    removeHandler,
    id,
    removeAllHandler,
}: SelectedRegionIdsList) => {
    const PAGE_SIZE = 15;
    const COLUMN_SIZE = PAGE_SIZE / 3;

    const [pageIdx, setPageIdx] = useState(0);

    const selectedRegionIdListItems = selectedRegionIds.map(
        (regionId, idx) => ({
            removeHandler: removeHandler(idx),
            preview: regionId,
        })
    );

    const getPagedRegionIds = () => {
        const pagedRegionIds: (typeof selectedRegionIdListItems)[][] = [];

        let pageCounter = 0;
        let columnCounter = 0;
        for (const [
            idx,
            selectedRegionId,
        ] of selectedRegionIdListItems.entries()) {
            if (idx % PAGE_SIZE === 0) {
                pagedRegionIds.push([]);
            }
            if (idx % COLUMN_SIZE === 0) {
                pagedRegionIds[pageCounter].push([]);
            }

            pagedRegionIds[pageCounter][columnCounter].push(selectedRegionId);

            if (idx % PAGE_SIZE === PAGE_SIZE - 1) {
                ++pageCounter;
                columnCounter = 0;
                continue;
            }
            if (idx % COLUMN_SIZE === COLUMN_SIZE - 1) ++columnCounter;
        }
        return pagedRegionIds;
    };

    const pagedRegionIds = getPagedRegionIds();

    const isNavigatable = pagedRegionIds.length > 1;

    return (
        <>
            {selectedRegionIds.length > 0 && (
                <Container className="mb-1 p-0" fluid>
                    <Stack
                        direction="horizontal"
                        gap={1}
                        className="flex-column flex-md-row"
                    >
                        {pagedRegionIds[pageIdx].map((column) => (
                            <Stack direction="vertical" gap={1}>
                                <SelectedItemList
                                    selectedItems={column}
                                    id={id}
                                    removeToolTip="Remove Region Id"
                                />
                            </Stack>
                        ))}
                    </Stack>
                    <Stack direction="horizontal" className="mt-1">
                        {isNavigatable && (
                            <Button
                                className={`mr-auto ${pageIdx > 0 ? "visible" : "invisible"}`}
                                onClick={() => setPageIdx(pageIdx - 1)}
                            >
                                <ArrowLeft />
                            </Button>
                        )}

                        {removeAllHandler && (
                            <Button
                                variant="outline-danger"
                                className="mx-auto"
                                onClick={removeAllHandler}
                                title="Remove item"
                            >
                                <Trash /> Remove All
                            </Button>
                        )}
                        {isNavigatable && (
                            <Button
                                className={`ml-auto ${pageIdx < pagedRegionIds.length - 1 ? "visible" : "invisible"}`}
                                onClick={() => setPageIdx(pageIdx + 1)}
                            >
                                <ArrowRight />
                            </Button>
                        )}
                    </Stack>
                </Container>
            )}
        </>
    );
};
