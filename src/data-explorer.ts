import { randomUUID } from "crypto";
import * as positron from "positron";
import { DataViewResponse } from "./server-client";

/**
 * Column display types matching Positron's Data Explorer protocol.
 */
type ColumnDisplayType =
  | "boolean"
  | "string"
  | "date"
  | "datetime"
  | "time"
  | "interval"
  | "object"
  | "array"
  | "struct"
  | "unknown"
  | "floating"
  | "integer"
  | "decimal";

type SupportStatus = "supported" | "unsupported";

interface TableShape {
  num_rows: number;
  num_columns: number;
}

interface ColumnSchema {
  column_name: string;
  column_index: number;
  type_name: string;
  type_display: ColumnDisplayType;
  description: string;
}

interface ColumnSortKey {
  column_index: number;
  ascending: boolean;
}

interface RowFilter {
  filter_id: string;
  filter_type: string;
  column_schema: ColumnSchema;
  condition: string;
  is_valid: boolean;
  error_message?: string;
  params?: unknown;
}

interface ColumnFilterTypeSupportStatus {
  column_filter_type: string;
  support_status: SupportStatus;
}

interface RowFilterTypeSupportStatus {
  row_filter_type: string;
  support_status: SupportStatus;
}

interface ColumnProfileTypeSupportStatus {
  profile_type: string;
  support_status: SupportStatus;
}

interface SupportedFeatures {
  search_schema: {
    support_status: SupportStatus;
    supported_types: ColumnFilterTypeSupportStatus[];
  };
  set_column_filters: {
    support_status: SupportStatus;
    supported_types: ColumnFilterTypeSupportStatus[];
  };
  set_row_filters: {
    support_status: SupportStatus;
    supports_conditions: SupportStatus;
    supported_types: RowFilterTypeSupportStatus[];
  };
  get_column_profiles: {
    support_status: SupportStatus;
    supported_types: ColumnProfileTypeSupportStatus[];
  };
  set_sort_columns: {
    support_status: SupportStatus;
  };
  export_data_selection: {
    support_status: SupportStatus;
    supported_formats: string[];
  };
}

interface TableState {
  display_name: string;
  table_shape: TableShape;
  table_unfiltered_shape: TableShape;
  has_row_labels: boolean;
  column_filters: ColumnFilter[];
  row_filters: RowFilter[];
  sort_keys: ColumnSortKey[];
  supported_features: SupportedFeatures;
}

interface FormatOptions {
  large_num_digits?: number;
  small_num_digits?: number;
  max_integral_digits?: number;
  max_value_length?: number;
  thousands_sep?: string;
}

interface ColumnSelection {
  column_index: number;
  spec: { first_index: number; last_index: number };
}

interface ColumnFilter {
  filter_type?: string;
  params?: Record<string, unknown>;
}

interface RowFilterComparisonParams {
  op?: string;
  value?: string;
}

interface RowFilterBetweenParams {
  left_value?: string;
  right_value?: string;
}

interface RowFilterSearchParams {
  search_type?: string;
  term?: string;
  case_sensitive?: boolean;
}

interface ColumnHistogramParams {
  method?: string;
  num_bins?: number;
  quantiles?: number[];
}

interface ColumnFrequencyTableParams {
  limit?: number;
}

interface ColumnProfileSpec {
  profile_type: string;
  params?: ColumnHistogramParams | ColumnFrequencyTableParams | Record<string, unknown>;
}

interface ColumnProfileRequest {
  column_index: number;
  profiles: ColumnProfileSpec[];
}

interface GetColumnProfilesParams {
  callback_id?: string;
  profiles?: ColumnProfileRequest[];
  format_options?: FormatOptions;
}

interface ColumnQuantileValue {
  q: number;
  value: string;
  exact: boolean;
}

interface ColumnHistogram {
  bin_edges: string[];
  bin_counts: number[];
  quantiles: ColumnQuantileValue[];
}

interface ColumnFrequencyTable {
  values: string[];
  counts: number[];
  other_count?: number;
}

interface SummaryStatsNumber {
  min_value?: string;
  max_value?: string;
  mean?: string;
  median?: string;
  stdev?: string;
}

interface SummaryStatsString {
  num_empty: number;
  num_unique: number;
}

interface SummaryStatsBoolean {
  true_count: number;
  false_count: number;
}

interface SummaryStatsDate {
  num_unique?: number;
  min_date?: string;
  mean_date?: string;
  median_date?: string;
  max_date?: string;
}

interface SummaryStatsDatetime {
  num_unique?: number;
  min_date?: string;
  mean_date?: string;
  median_date?: string;
  max_date?: string;
  timezone?: string;
}

interface SummaryStatsOther {
  num_unique?: number;
}

interface ColumnSummaryStats {
  type_display: ColumnDisplayType;
  number_stats?: SummaryStatsNumber;
  string_stats?: SummaryStatsString;
  boolean_stats?: SummaryStatsBoolean;
  date_stats?: SummaryStatsDate;
  datetime_stats?: SummaryStatsDatetime;
  other_stats?: SummaryStatsOther;
}

interface ColumnProfileResult {
  null_count?: number;
  summary_stats?: ColumnSummaryStats;
  small_histogram?: ColumnHistogram;
  large_histogram?: ColumnHistogram;
  small_frequency_table?: ColumnFrequencyTable;
  large_frequency_table?: ColumnFrequencyTable;
}

interface ReturnColumnProfilesParams {
  callback_id: string;
  profiles: ColumnProfileResult[];
  error_message?: string;
}

interface ParsedDateValue {
  timestamp: number;
  timezone?: string;
}

/**
 * Manages a single Data Explorer instance backed by Stata dataset data.
 */
export class StataDataExplorer {
  readonly commId: string;

  private _data: DataViewResponse;
  private _title: string;
  private _schemas: ColumnSchema[];
  private _columnFilters: ColumnFilter[] = [];
  private _rowFilters: RowFilter[] = [];
  private _filteredIndices: number[] | undefined;
  private _sortKeys: ColumnSortKey[] = [];
  private _sortedIndices: number[] | undefined;

  constructor(data: DataViewResponse, title: string) {
    this.commId = randomUUID();
    this._data = data;
    this._title = title;
    this._schemas = this.buildSchemas();
  }

  /**
   * Build the CommOpen message payload to send to Positron.
   */
  buildCommOpenMessage(
    parentId: string,
    variablePath?: string[],
  ): positron.LanguageRuntimeCommOpen {
    return {
      id: randomUUID(),
      parent_id: parentId,
      when: new Date().toISOString(),
      type: positron.LanguageRuntimeMessageType.CommOpen,
      comm_id: this.commId,
      target_name: "positron.dataExplorer",
      data: {
        title: this._title,
        variable_path: variablePath,
      },
    } as positron.LanguageRuntimeCommOpen;
  }

  /**
   * Handle an incoming JSON-RPC request from the Data Explorer frontend.
   * Returns the result payload, or throws on error.
   */
  handleRequest(method: string, params: Record<string, unknown>): unknown {
    switch (method) {
      case "get_state":
        return this.getState();
      case "get_schema":
        return this.getSchema(params);
      case "search_schema":
        return this.searchSchema(params);
      case "get_data_values":
        return this.getDataValues(params);
      case "get_row_labels":
        return this.getRowLabels(params);
      case "set_sort_columns":
        return this.setSortColumns(params);
      case "set_row_filters":
        return this.setRowFilters(params);
      case "set_column_filters":
        return this.setColumnFilters(params);
      case "get_column_profiles":
        return null;
      case "export_data_selection":
        return this.exportDataSelection(params);
      default:
        throw new Error(`Unknown data explorer method: ${method}`);
    }
  }

  /**
   * Build the async response payload for get_column_profiles.
   */
  buildColumnProfilesResponse(
    params: Record<string, unknown>,
  ): ReturnColumnProfilesParams {
    const request = params as GetColumnProfilesParams;
    const formatOptions = request.format_options ?? {};
    const profileRequests = Array.isArray(request.profiles)
      ? request.profiles
      : [];

    return {
      callback_id: request.callback_id ?? "",
      profiles: profileRequests.map((profileRequest) =>
        this.buildColumnProfileResult(profileRequest, formatOptions),
      ),
    };
  }

  /**
   * Update the backing data (e.g. after re-execution).
   */
  updateData(data: DataViewResponse): void {
    this._data = data;
    this._schemas = this.buildSchemas();
    this._columnFilters = [];
    this._rowFilters = [];
    this._filteredIndices = undefined;
    this._sortKeys = [];
    this._sortedIndices = undefined;
  }

  private getState(): TableState {
    // Report the number of rows we can currently serve. Positron will request
    // data by row index, so table_shape must never exceed the locally cached
    // row count even if the server reports a larger total_rows value.
    const numRows = this.getViewRowCount();
    const numColumns = this._data.columns.length;
    const unfilteredRows = this._data.total_rows || numRows;

    return {
      display_name: this._title,
      table_shape: { num_rows: numRows, num_columns: numColumns },
      table_unfiltered_shape: {
        num_rows: unfilteredRows,
        num_columns: numColumns,
      },
      has_row_labels: true,
      column_filters: this._columnFilters,
      row_filters: this._rowFilters,
      sort_keys: this._sortKeys,
      supported_features: {
        search_schema: {
          support_status: "supported",
          supported_types: [
            {
              column_filter_type: "text_search",
              support_status: "supported",
            },
            {
              column_filter_type: "match_data_types",
              support_status: "supported",
            },
          ],
        },
        set_column_filters: {
          support_status: "supported",
          supported_types: [
            {
              column_filter_type: "text_search",
              support_status: "supported",
            },
            {
              column_filter_type: "match_data_types",
              support_status: "supported",
            },
          ],
        },
        set_row_filters: {
          support_status: "supported",
          supports_conditions: "supported",
          supported_types: [
            {
              row_filter_type: "is_null",
              support_status: "supported",
            },
            {
              row_filter_type: "not_null",
              support_status: "supported",
            },
            {
              row_filter_type: "compare",
              support_status: "supported",
            },
            {
              row_filter_type: "between",
              support_status: "supported",
            },
            {
              row_filter_type: "search",
              support_status: "supported",
            },
          ],
        },
        get_column_profiles: {
          support_status: "supported",
          supported_types: [
            { profile_type: "null_count", support_status: "supported" },
            { profile_type: "summary_stats", support_status: "supported" },
            { profile_type: "small_histogram", support_status: "supported" },
            { profile_type: "large_histogram", support_status: "supported" },
            {
              profile_type: "small_frequency_table",
              support_status: "supported",
            },
            {
              profile_type: "large_frequency_table",
              support_status: "supported",
            },
          ],
        },
        set_sort_columns: { support_status: "supported" },
        export_data_selection: {
          support_status: "supported",
          supported_formats: ["tsv", "csv", "html"],
        },
      },
    };
  }

  private getSchema(
    params: Record<string, unknown>,
  ): { columns: ColumnSchema[] } {
    const columnIndices = params.column_indices as number[] | undefined;
    if (columnIndices && Array.isArray(columnIndices)) {
      return {
        columns: columnIndices.map((i) => this._schemas[i]).filter(Boolean),
      };
    }

    const startIndex = (params.start_index as number) ?? 0;
    const numColumns = (params.num_columns as number) ?? this._schemas.length;
    return {
      columns: this._schemas.slice(startIndex, startIndex + numColumns),
    };
  }

  private searchSchema(
    params: Record<string, unknown>,
  ): { matches: number[] } {
    const filters = Array.isArray(params.filters)
      ? (params.filters as ColumnFilter[])
      : [];
    const sortOrder = String(params.sort_order ?? "original");

    let matches = this._schemas
      .filter((schema) => this.matchesColumnFilters(schema, filters))
      .map((schema) => schema.column_index);

    if (sortOrder === "ascending_name" || sortOrder === "descending_name") {
      matches = matches.sort((a, b) =>
        this._schemas[a].column_name.localeCompare(this._schemas[b].column_name),
      );
      if (sortOrder === "descending_name") {
        matches.reverse();
      }
    }

    if (sortOrder === "ascending_type" || sortOrder === "descending_type") {
      matches = matches.sort((a, b) => {
        const typeCompare = this._schemas[a].type_name.localeCompare(
          this._schemas[b].type_name,
        );
        if (typeCompare !== 0) {
          return typeCompare;
        }
        return this._schemas[a].column_name.localeCompare(
          this._schemas[b].column_name,
        );
      });
      if (sortOrder === "descending_type") {
        matches.reverse();
      }
    }

    return { matches };
  }

  private getDataValues(
    params: Record<string, unknown>,
  ): { columns: string[][] } {
    const selections = params.columns as ColumnSelection[] | undefined;
    const formatOptions = (params.format_options ?? {}) as FormatOptions;

    if (!selections || selections.length === 0) {
      return { columns: [] };
    }

    const result: string[][] = [];
    const indexMap = this.getViewIndices();
    const viewRowCount = this.getViewRowCount();

    for (const selection of selections) {
      const colIdx = selection.column_index;
      const spec = selection.spec;
      const startRow = spec?.first_index ?? 0;
      const endRow = spec?.last_index ?? viewRowCount - 1;
      const values: string[] = [];

      for (let r = startRow; r <= endRow && r < viewRowCount; r++) {
        const dataRow = indexMap ? indexMap[r] : r;
        if (dataRow === undefined || dataRow >= this._data.data.length) {
          values.push("");
          continue;
        }
        const row = this._data.data[dataRow];
        const cell = row?.[colIdx];
        values.push(this.formatValue(cell, formatOptions));
      }

      result.push(values);
    }

    return { columns: result };
  }

  private getRowLabels(
    params: Record<string, unknown>,
  ): { row_labels: string[][] } {
    const selection = params.selection as
      | { first_index: number; last_index: number }
      | undefined;
    const startRow = selection?.first_index ?? 0;
    const viewRowCount = this.getViewRowCount();
    const endRow = selection?.last_index ?? viewRowCount - 1;

    const indexMap = this.getViewIndices();
    const labels: string[][] = [];
    for (let r = startRow; r <= endRow && r < viewRowCount; r++) {
      const dataRow = indexMap ? indexMap[r] : r;
      const obsNum =
        dataRow !== undefined
          ? (this._data.index[dataRow] ?? dataRow) + 1
          : r + 1;
      labels.push([String(obsNum)]);
    }

    return { row_labels: labels };
  }

  private setSortColumns(
    params: Record<string, unknown>,
  ): Record<string, never> {
    const sortKeys = (params.sort_keys as ColumnSortKey[]) ?? [];
    this._sortKeys = sortKeys;
    this._sortedIndices = undefined;
    return {};
  }

  private setColumnFilters(
    params: Record<string, unknown>,
  ): Record<string, never> {
    this._columnFilters = Array.isArray(params.filters)
      ? (params.filters as ColumnFilter[])
      : [];
    return {};
  }

  private setRowFilters(
    params: Record<string, unknown>,
  ): { selected_num_rows: number; had_errors?: boolean } {
    const filters = Array.isArray(params.filters)
      ? (params.filters as RowFilter[])
      : [];
    this._rowFilters = filters;
    this._filteredIndices = this.applyRowFilters(filters);
    this._sortedIndices = undefined;
    return { selected_num_rows: this.getViewRowCount() };
  }

  private exportDataSelection(
    params: Record<string, unknown>,
  ): { data: string; format: string } {
    const selection = params.selection as {
      kind: string;
      selection: {
        column_index?: number;
        first_index?: number;
        last_index?: number;
      };
    };

    if (!selection) {
      return { data: "", format: "tsv" };
    }

    const format = (params.format as string) ?? "tsv";
    const sep = format === "csv" ? "," : "\t";

    if (selection.kind === "single_cell") {
      const sel = selection.selection;
      const rowIdx = sel.first_index ?? 0;
      const colIdx = sel.column_index ?? 0;
      const indexMap = this.getViewIndices();
      const dataRow = indexMap ? indexMap[rowIdx] : rowIdx;
      const cell = this._data.data[dataRow]?.[colIdx];
      return { data: this.formatValue(cell, {}), format };
    }

    const firstRow =
      (selection.selection as { first_index?: number })?.first_index ?? 0;
    const lastRow =
      (selection.selection as { last_index?: number })?.last_index ??
      this.getViewRowCount() - 1;
    const indexMap = this.getViewIndices();
    const viewRowCount = this.getViewRowCount();

    const header = this._data.columns.join(sep);
    const rows: string[] = [header];
    for (let r = firstRow; r <= lastRow && r < viewRowCount; r++) {
      const dataRow = indexMap ? indexMap[r] : r;
      const row = this._data.data[dataRow] ?? [];
      rows.push(row.map((cell) => this.formatValue(cell, {})).join(sep));
    }

    return { data: rows.join("\n"), format };
  }

  private buildSchemas(): ColumnSchema[] {
    return this._data.columns.map((column, index) => {
      const dtype = this._data.dtypes[column] || "unknown";
      return {
        column_name: column,
        column_index: index,
        type_name: dtype,
        type_display: this.mapDtypeToDisplay(dtype),
        description: "",
      };
    });
  }

  private matchesColumnFilters(
    schema: ColumnSchema,
    filters: ColumnFilter[],
  ): boolean {
    return filters.every((filter) => {
      if (filter.filter_type === "text_search") {
        const term = String(filter.params?.term ?? "");
        const searchType = String(filter.params?.search_type ?? "contains");
        const caseSensitive = Boolean(filter.params?.case_sensitive);
        const columnName = caseSensitive
          ? schema.column_name
          : schema.column_name.toLowerCase();
        const needle = caseSensitive ? term : term.toLowerCase();

        switch (searchType) {
          case "starts_with":
            return columnName.startsWith(needle);
          case "ends_with":
            return columnName.endsWith(needle);
          case "not_contains":
            return !columnName.includes(needle);
          case "regex_match":
            try {
              return new RegExp(term, caseSensitive ? "" : "i").test(
                schema.column_name,
              );
            } catch {
              return true;
            }
          case "contains":
          default:
            return columnName.includes(needle);
        }
      }

      if (filter.filter_type === "match_data_types") {
        const displayTypes = Array.isArray(filter.params?.display_types)
          ? (filter.params?.display_types as string[])
          : [];
        return (
          displayTypes.length === 0 ||
          displayTypes.includes(schema.type_display)
        );
      }

      return true;
    });
  }

  private mapDtypeToDisplay(dtype: string): ColumnDisplayType {
    const lower = dtype.toLowerCase();

    if (/bool/.test(lower)) {
      return "boolean";
    }
    if (/datetime|timestamp/.test(lower)) {
      return "datetime";
    }
    if (/\bdate\b/.test(lower)) {
      return "date";
    }
    if (/\btime\b/.test(lower)) {
      return "time";
    }
    if (/decimal/.test(lower)) {
      return "decimal";
    }
    if (
      /^(byte|short|int|long|integer|int8|int16|int32|int64|uint8|uint16|uint32|uint64)/.test(
        lower,
      )
    ) {
      return "integer";
    }
    if (
      /^(float|double|real|numeric|number|float16|float32|float64|float128)/.test(
        lower,
      )
    ) {
      return "floating";
    }
    if (/^(str|string|object|category|char|varchar|text)/.test(lower)) {
      return "string";
    }

    return "unknown";
  }

  private getViewIndices(): number[] | undefined {
    if (!this._filteredIndices && this._sortKeys.length === 0) {
      return undefined;
    }

    if (this._sortedIndices) {
      return this._sortedIndices;
    }

    const indices = this._filteredIndices
      ? [...this._filteredIndices]
      : Array.from({ length: this._data.data.length }, (_, i) => i);

    if (this._sortKeys.length > 0) {
      const keys = this._sortKeys;
      indices.sort((a, b) => {
        for (const key of keys) {
          const colIdx = key.column_index;
          const va = this._data.data[a]?.[colIdx];
          const vb = this._data.data[b]?.[colIdx];
          const cmp = this.compareValues(va, vb);
          if (cmp !== 0) {
            return key.ascending ? cmp : -cmp;
          }
        }
        return 0;
      });
    }

    this._sortedIndices = indices;
    return indices;
  }

  private getViewRowCount(): number {
    return this.getViewIndices()?.length ?? this._data.data.length;
  }

  private applyRowFilters(filters: RowFilter[]): number[] | undefined {
    if (filters.length === 0) {
      return undefined;
    }

    let mask: boolean[] | undefined;

    for (const filter of filters) {
      const filterMask = this.applySingleRowFilter(filter);
      if (!mask) {
        mask = filterMask;
        continue;
      }

      const condition = String(filter.condition ?? "and").toLowerCase();
      mask = mask.map((matches, index) =>
        condition === "or"
          ? matches || filterMask[index]
          : matches && filterMask[index],
      );
    }

    if (!mask) {
      return undefined;
    }

    return mask.flatMap((matches, index) => (matches ? [index] : []));
  }

  private applySingleRowFilter(filter: RowFilter): boolean[] {
    const columnIndex = filter.column_schema?.column_index;
    if (
      typeof columnIndex !== "number" ||
      columnIndex < 0 ||
      columnIndex >= this._schemas.length
    ) {
      return Array.from({ length: this._data.data.length }, () => true);
    }

    return this._data.data.map((row) =>
      this.valueMatchesFilter(row?.[columnIndex], filter),
    );
  }

  private valueMatchesFilter(value: unknown, filter: RowFilter): boolean {
    switch (filter.filter_type) {
      case "is_null":
        return this.isMissingValue(value);
      case "not_null":
        return !this.isMissingValue(value);
      case "compare":
        return this.applyComparisonFilter(
          value,
          (filter.params ?? {}) as RowFilterComparisonParams,
          filter.column_schema.type_display,
        );
      case "between":
        return this.applyBetweenFilter(
          value,
          (filter.params ?? {}) as RowFilterBetweenParams,
          filter.column_schema.type_display,
        );
      case "search":
        return this.applySearchFilter(
          value,
          (filter.params ?? {}) as RowFilterSearchParams,
        );
      default:
        return true;
    }
  }

  private applyComparisonFilter(
    value: unknown,
    params: RowFilterComparisonParams,
    typeDisplay: ColumnDisplayType,
  ): boolean {
    if (this.isMissingValue(value)) {
      return false;
    }

    const op = String(params.op ?? "=");
    const compareValue = params.value ?? "";

    if (
      typeDisplay === "integer" ||
      typeDisplay === "floating" ||
      typeDisplay === "decimal"
    ) {
      const left = this.coerceNumberValue(value);
      const right = this.coerceNumberValue(compareValue);
      if (left !== undefined && right !== undefined) {
        return this.evaluateComparison(left, op, right);
      }
    }

    if (typeDisplay === "date" || typeDisplay === "datetime" || typeDisplay === "time") {
      const left = this.coerceDateValue(value);
      const right = this.coerceDateValue(compareValue);
      if (left && right) {
        return this.evaluateComparison(left.timestamp, op, right.timestamp);
      }
    }

    const left = this.normalizeStringValue(value);
    const right = this.normalizeStringValue(compareValue);
    return this.evaluateComparison(left, op, right);
  }

  private applyBetweenFilter(
    value: unknown,
    params: RowFilterBetweenParams,
    typeDisplay: ColumnDisplayType,
  ): boolean {
    if (this.isMissingValue(value)) {
      return false;
    }

    const leftValue = params.left_value ?? "";
    const rightValue = params.right_value ?? "";

    if (
      typeDisplay === "integer" ||
      typeDisplay === "floating" ||
      typeDisplay === "decimal"
    ) {
      const valueNumber = this.coerceNumberValue(value);
      const left = this.coerceNumberValue(leftValue);
      const right = this.coerceNumberValue(rightValue);
      if (
        valueNumber !== undefined &&
        left !== undefined &&
        right !== undefined
      ) {
        return valueNumber >= left && valueNumber <= right;
      }
    }

    if (typeDisplay === "date" || typeDisplay === "datetime" || typeDisplay === "time") {
      const dateValue = this.coerceDateValue(value);
      const left = this.coerceDateValue(leftValue);
      const right = this.coerceDateValue(rightValue);
      if (dateValue && left && right) {
        return (
          dateValue.timestamp >= left.timestamp &&
          dateValue.timestamp <= right.timestamp
        );
      }
    }

    const textValue = this.normalizeStringValue(value);
    const left = this.normalizeStringValue(leftValue);
    const right = this.normalizeStringValue(rightValue);
    return textValue >= left && textValue <= right;
  }

  private applySearchFilter(
    value: unknown,
    params: RowFilterSearchParams,
  ): boolean {
    if (this.isMissingValue(value)) {
      return false;
    }

    const caseSensitive = Boolean(params.case_sensitive);
    const searchType = String(params.search_type ?? "contains");
    let text = this.normalizeStringValue(value);
    let term = String(params.term ?? "");

    if (!caseSensitive) {
      text = text.toLowerCase();
      term = term.toLowerCase();
    }

    switch (searchType) {
      case "starts_with":
        return text.startsWith(term);
      case "ends_with":
        return text.endsWith(term);
      case "not_contains":
        return !text.includes(term);
      case "regex_match":
        try {
          return new RegExp(params.term ?? "", caseSensitive ? "" : "i").test(
            this.normalizeStringValue(value),
          );
        } catch {
          return false;
        }
      case "contains":
      default:
        return text.includes(term);
    }
  }

  private evaluateComparison<T extends number | string>(
    left: T,
    op: string,
    right: T,
  ): boolean {
    switch (op) {
      case "!=":
        return left !== right;
      case "<":
        return left < right;
      case "<=":
        return left <= right;
      case ">":
        return left > right;
      case ">=":
        return left >= right;
      case "=":
      default:
        return left === right;
    }
  }

  private compareValues(a: unknown, b: unknown): number {
    if (a === null || a === undefined) {
      return b === null || b === undefined ? 0 : 1;
    }
    if (b === null || b === undefined) {
      return -1;
    }

    if (typeof a === "number" && typeof b === "number") {
      if (Number.isNaN(a)) {
        return Number.isNaN(b) ? 0 : 1;
      }
      if (Number.isNaN(b)) {
        return -1;
      }
      return a - b;
    }

    return String(a).localeCompare(String(b));
  }

  private getColumnValues(columnIndex: number): unknown[] {
    const indexMap = this.getViewIndices();
    if (!indexMap) {
      return this._data.data.map((row) => row?.[columnIndex]);
    }
    return indexMap.map((rowIndex) => this._data.data[rowIndex]?.[columnIndex]);
  }

  private buildColumnProfileResult(
    request: ColumnProfileRequest,
    formatOptions: FormatOptions,
  ): ColumnProfileResult {
    const schema = this._schemas[request.column_index];
    if (!schema) {
      return {};
    }

    const values = this.getColumnValues(request.column_index);
    const result: ColumnProfileResult = {};

    for (const profile of request.profiles ?? []) {
      switch (profile.profile_type) {
        case "null_count":
          result.null_count = values.filter((value) =>
            this.isMissingValue(value),
          ).length;
          break;
        case "summary_stats":
          result.summary_stats = this.buildSummaryStats(
            schema,
            values,
            formatOptions,
          );
          break;
        case "small_histogram":
          result.small_histogram = this.buildHistogram(
            values,
            schema.type_display,
            (profile.params ?? {}) as ColumnHistogramParams,
            formatOptions,
          );
          break;
        case "large_histogram":
          result.large_histogram = this.buildHistogram(
            values,
            schema.type_display,
            (profile.params ?? {}) as ColumnHistogramParams,
            formatOptions,
          );
          break;
        case "small_frequency_table":
          result.small_frequency_table = this.buildFrequencyTable(
            values,
            (profile.params ?? {}) as ColumnFrequencyTableParams,
            formatOptions,
          );
          break;
        case "large_frequency_table":
          result.large_frequency_table = this.buildFrequencyTable(
            values,
            (profile.params ?? {}) as ColumnFrequencyTableParams,
            formatOptions,
          );
          break;
      }
    }

    return result;
  }

  private buildSummaryStats(
    schema: ColumnSchema,
    values: unknown[],
    formatOptions: FormatOptions,
  ): ColumnSummaryStats {
    const typeDisplay = schema.type_display;
    const nonMissingValues = values.filter((value) => !this.isMissingValue(value));

    if (
      typeDisplay === "integer" ||
      typeDisplay === "floating" ||
      typeDisplay === "decimal"
    ) {
      const numericValues = nonMissingValues
        .map((value) => this.coerceNumberValue(value))
        .filter((value): value is number => value !== undefined);

      return {
        type_display: typeDisplay,
        number_stats: this.buildNumberStats(numericValues, formatOptions),
      };
    }

    if (typeDisplay === "boolean") {
      const booleanValues = nonMissingValues
        .map((value) => this.coerceBooleanValue(value))
        .filter((value): value is boolean => value !== undefined);

      return {
        type_display: typeDisplay,
        boolean_stats: {
          true_count: booleanValues.filter(Boolean).length,
          false_count: booleanValues.filter((value) => !value).length,
        },
      };
    }

    if (typeDisplay === "date") {
      const dates = nonMissingValues
        .map((value) => this.coerceDateValue(value))
        .filter((value): value is ParsedDateValue => value !== undefined);

      return {
        type_display: typeDisplay,
        date_stats: this.buildDateStats(dates),
      };
    }

    if (typeDisplay === "datetime") {
      const dates = nonMissingValues
        .map((value) => this.coerceDateValue(value))
        .filter((value): value is ParsedDateValue => value !== undefined);

      return {
        type_display: typeDisplay,
        datetime_stats: this.buildDatetimeStats(dates),
      };
    }

    if (typeDisplay === "string" || typeDisplay === "time" || typeDisplay === "interval") {
      const strings = nonMissingValues.map((value) =>
        this.normalizeStringValue(value),
      );

      return {
        type_display: typeDisplay === "string" ? "string" : typeDisplay,
        string_stats: {
          num_empty: strings.filter((value) => value.length === 0).length,
          num_unique: new Set(strings).size,
        },
      };
    }

    const formattedValues = nonMissingValues.map((value) =>
      this.formatValue(value, formatOptions),
    );
    return {
      type_display: typeDisplay,
      other_stats: {
        num_unique: new Set(formattedValues).size,
      },
    };
  }

  private buildNumberStats(
    values: number[],
    formatOptions: FormatOptions,
  ): SummaryStatsNumber | undefined {
    if (values.length === 0) {
      return undefined;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const mean =
      sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
    const median = this.computeMedian(sorted);
    const stdev = this.computeSampleStdDev(sorted, mean);

    return {
      min_value: this.formatProfileNumber(min, formatOptions, Number.isInteger(min)),
      max_value: this.formatProfileNumber(max, formatOptions, Number.isInteger(max)),
      mean: this.formatProfileNumber(mean, formatOptions),
      median: this.formatProfileNumber(median, formatOptions),
      stdev:
        stdev === undefined
          ? undefined
          : this.formatProfileNumber(stdev, formatOptions),
    };
  }

  private buildDateStats(values: ParsedDateValue[]): SummaryStatsDate | undefined {
    if (values.length === 0) {
      return undefined;
    }

    const sorted = [...values].sort((a, b) => a.timestamp - b.timestamp);
    const timestamps = sorted.map((value) => value.timestamp);
    const medianTimestamp = this.computeMedian(timestamps);
    const meanTimestamp =
      timestamps.reduce((sum, value) => sum + value, 0) / timestamps.length;

    return {
      num_unique: new Set(timestamps).size,
      min_date: this.formatDateValue(sorted[0].timestamp, false),
      mean_date: this.formatDateValue(meanTimestamp, false),
      median_date: this.formatDateValue(medianTimestamp, false),
      max_date: this.formatDateValue(sorted[sorted.length - 1].timestamp, false),
    };
  }

  private buildDatetimeStats(
    values: ParsedDateValue[],
  ): SummaryStatsDatetime | undefined {
    if (values.length === 0) {
      return undefined;
    }

    const sorted = [...values].sort((a, b) => a.timestamp - b.timestamp);
    const timestamps = sorted.map((value) => value.timestamp);
    const medianTimestamp = this.computeMedian(timestamps);
    const meanTimestamp =
      timestamps.reduce((sum, value) => sum + value, 0) / timestamps.length;
    const timezone = sorted.find((value) => value.timezone)?.timezone;

    return {
      num_unique: new Set(timestamps).size,
      min_date: this.formatDateValue(sorted[0].timestamp, true),
      mean_date: this.formatDateValue(meanTimestamp, true),
      median_date: this.formatDateValue(medianTimestamp, true),
      max_date: this.formatDateValue(
        sorted[sorted.length - 1].timestamp,
        true,
      ),
      timezone,
    };
  }

  private buildHistogram(
    values: unknown[],
    typeDisplay: ColumnDisplayType,
    params: ColumnHistogramParams,
    formatOptions: FormatOptions,
  ): ColumnHistogram | undefined {
    if (
      typeDisplay !== "integer" &&
      typeDisplay !== "floating" &&
      typeDisplay !== "decimal"
    ) {
      return undefined;
    }

    const numericValues = values
      .map((value) => this.coerceNumberValue(value))
      .filter((value): value is number => value !== undefined)
      .sort((a, b) => a - b);

    if (numericValues.length === 0) {
      return undefined;
    }

    const requestedBins = Math.max(1, Math.floor(params.num_bins ?? 20));
    const min = numericValues[0];
    const max = numericValues[numericValues.length - 1];

    if (min === max) {
      const delta = min === 0 ? 1 : Math.abs(min) * 0.1 || 1;
      return {
        bin_edges: [
          this.formatProfileNumber(min - delta, formatOptions),
          this.formatProfileNumber(max + delta, formatOptions),
        ],
        bin_counts: [numericValues.length],
        quantiles: this.buildQuantiles(
          numericValues,
          params.quantiles ?? [],
          formatOptions,
        ),
      };
    }

    const binCount = requestedBins;
    const binWidth = (max - min) / binCount;
    const counts = Array.from({ length: binCount }, () => 0);

    for (const value of numericValues) {
      const rawIndex = Math.floor((value - min) / binWidth);
      const index = Math.min(binCount - 1, Math.max(0, rawIndex));
      counts[index] += 1;
    }

    const edges = Array.from({ length: binCount + 1 }, (_, index) =>
      this.formatProfileNumber(min + index * binWidth, formatOptions),
    );

    return {
      bin_edges: edges,
      bin_counts: counts,
      quantiles: this.buildQuantiles(
        numericValues,
        params.quantiles ?? [],
        formatOptions,
      ),
    };
  }

  private buildFrequencyTable(
    values: unknown[],
    params: ColumnFrequencyTableParams,
    formatOptions: FormatOptions,
  ): ColumnFrequencyTable | undefined {
    const limit = Math.max(1, Math.floor(params.limit ?? 8));
    const formattedValues = values
      .filter((value) => !this.isMissingValue(value))
      .map((value) => this.formatValue(value, formatOptions));

    if (formattedValues.length === 0) {
      return undefined;
    }

    const counts = new Map<string, number>();
    for (const value of formattedValues) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }

    const sorted = [...counts.entries()].sort((a, b) => {
      if (b[1] !== a[1]) {
        return b[1] - a[1];
      }
      return a[0].localeCompare(b[0]);
    });

    const top = sorted.slice(0, limit);
    const topCount = top.reduce((sum, [, count]) => sum + count, 0);
    const otherCount = formattedValues.length - topCount;

    return {
      values: top.map(([value]) => value),
      counts: top.map(([, count]) => count),
      other_count: otherCount > 0 ? otherCount : undefined,
    };
  }

  private buildQuantiles(
    sortedValues: number[],
    requestedQuantiles: number[],
    formatOptions: FormatOptions,
  ): ColumnQuantileValue[] {
    const quantiles = Array.isArray(requestedQuantiles)
      ? requestedQuantiles
      : [];

    return quantiles
      .filter((quantile) => Number.isFinite(quantile) && quantile >= 0 && quantile <= 1)
      .map((quantile) => ({
        q: quantile,
        value: this.formatProfileNumber(
          this.computeQuantile(sortedValues, quantile),
          formatOptions,
        ),
        exact: true,
      }));
  }

  private computeMedian(sortedValues: number[]): number {
    return this.computeQuantile(sortedValues, 0.5);
  }

  private computeQuantile(sortedValues: number[], quantile: number): number {
    if (sortedValues.length === 0) {
      return Number.NaN;
    }

    const position = (sortedValues.length - 1) * quantile;
    const lowerIndex = Math.floor(position);
    const upperIndex = Math.ceil(position);
    const lowerValue = sortedValues[lowerIndex];
    const upperValue = sortedValues[upperIndex];

    if (lowerIndex === upperIndex) {
      return lowerValue;
    }

    return lowerValue + (upperValue - lowerValue) * (position - lowerIndex);
  }

  private computeSampleStdDev(
    values: number[],
    mean: number,
  ): number | undefined {
    if (values.length < 2) {
      return undefined;
    }

    const variance =
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      (values.length - 1);
    return Math.sqrt(variance);
  }

  private isMissingValue(value: unknown): boolean {
    if (value === null || value === undefined) {
      return true;
    }

    if (typeof value === "number") {
      return !Number.isFinite(value);
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed === "." || /^\.[a-z]$/i.test(trimmed);
    }

    return false;
  }

  private normalizeStringValue(value: unknown): string {
    if (value === null || value === undefined) {
      return "";
    }

    if (typeof value === "string") {
      return value;
    }

    return String(value);
  }

  private coerceNumberValue(value: unknown): number | undefined {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : undefined;
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed || this.isMissingValue(trimmed)) {
        return undefined;
      }

      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : undefined;
    }

    return undefined;
  }

  private coerceBooleanValue(value: unknown): boolean | undefined {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number") {
      if (value === 1) {
        return true;
      }
      if (value === 0) {
        return false;
      }
      return undefined;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "t", "yes", "y", "1"].includes(normalized)) {
        return true;
      }
      if (["false", "f", "no", "n", "0"].includes(normalized)) {
        return false;
      }
    }

    return undefined;
  }

  private coerceDateValue(value: unknown): ParsedDateValue | undefined {
    if (value instanceof Date && Number.isFinite(value.getTime())) {
      return { timestamp: value.getTime() };
    }

    if (typeof value === "string") {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) {
        return {
          timestamp: parsed,
          timezone: /z$|[+-]\d{2}:?\d{2}$/i.test(value) ? "UTC" : undefined,
        };
      }
    }

    return undefined;
  }

  private formatDateValue(timestamp: number, includeTime: boolean): string {
    const date = new Date(timestamp);
    if (includeTime) {
      return date.toISOString().replace(".000Z", "Z");
    }
    return date.toISOString().slice(0, 10);
  }

  private formatProfileNumber(
    value: number,
    options: FormatOptions,
    preferInteger = false,
  ): string {
    if (!Number.isFinite(value)) {
      return "";
    }

    if (preferInteger && Number.isInteger(value)) {
      return String(value);
    }

    const largeDigits = options.large_num_digits ?? 2;
    const smallDigits = options.small_num_digits ?? 4;
    const absValue = Math.abs(value);
    const digits = absValue >= 1 ? largeDigits : smallDigits;
    const formatted = value.toFixed(digits);

    return formatted.replace(/(\.\d*?[1-9])0+$/u, "$1").replace(/\.0+$/u, ".0");
  }

  private formatValue(cell: unknown, options: FormatOptions): string {
    if (cell === null || cell === undefined) {
      return "";
    }

    if (typeof cell === "number") {
      if (!Number.isFinite(cell)) {
        return "";
      }
      return this.formatProfileNumber(cell, options, Number.isInteger(cell));
    }

    const maxValueLength = options.max_value_length ?? 1000;
    const text = String(cell);
    return text.length > maxValueLength
      ? `${text.slice(0, maxValueLength)}...`
      : text;
  }
}
