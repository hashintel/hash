import React, { useCallback, VFC } from "react";
import { tw } from "twind";

type PaginationProps = {
  pageCount: number;
  pageSize: number;
  pageNumber: number;
  setPageIndex: (index: number) => void;
  setPageSize: (pageSize: number) => void;
  isFetching: boolean;
};

export const Pagination: VFC<PaginationProps> = ({
  pageCount,
  pageNumber,
  pageSize,
  setPageIndex,
  setPageSize,
  isFetching = false,
}) => {
  const renderPageButtons = useCallback(() => {
    const pages = Array.from({ length: pageCount });

    return pages.map((_, index) => {
      const _page = index + 1;
      return (
        <button
          type="button"
          className={tw`border-1 w-7 h-7 py-0.5 rounded-md text-sm leading-none mr-1 ${
            _page === pageNumber ? "border-blue-500 text-blue-500" : ""
          } focus:outline-none`}
          onClick={() => setPageIndex(_page)}
          disabled={isFetching}
          key={_page}
        >
          {_page}
        </button>
      );
    });
  }, [pageNumber, isFetching, pageCount, setPageIndex]);

  return (
    <div className={tw`flex justify-end items-center py-1`}>
      {/* We'd have to think of the various page sizes to work with */}
      <div className={tw`flex items-center text-sm mr-6`}>
        <select
          className={tw`h-7 rounded-md border-1 mr-1`}
          onChange={(evt) => setPageSize(Number(evt.target.value))}
          value={pageSize}
        >
          <option>---</option>
          {[3, 5, 10].map((size) => (
            <option value={size} key={size}>
              {size}
            </option>
          ))}
        </select>
        <span>per page</span>
      </div>
      {pageCount > 1 && <div className={tw``}>{renderPageButtons()}</div>}
    </div>
  );
};
