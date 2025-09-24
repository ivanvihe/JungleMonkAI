import React from 'react';
import { ProTable } from '@ant-design/pro-components';
import type { ProTableProps } from '@ant-design/pro-components';

export type ProDataTableProps<RecordType extends Record<string, any>, Params extends Record<string, any> = Record<string, any>> =
  ProTableProps<RecordType, Params> & {
    "aria-label"?: string;
  };

export const ProDataTable = <RecordType extends Record<string, any>, Params extends Record<string, any> = Record<string, any>>({
  search,
  options,
  pagination,
  ...rest
}: ProDataTableProps<RecordType, Params>) => {
  return (
    <ProTable<RecordType, Params>
      rowKey="id"
      search={search ?? false}
      options={options ?? { density: false, fullScreen: false, reload: false, setting: false }}
      pagination={
        pagination ?? {
          pageSize: 10,
          showSizeChanger: true,
          size: 'small',
          showTotal: total => `${total} registros`,
        }
      }
      size="small"
      bordered
      {...rest}
    />
  );
};

export default ProDataTable;
