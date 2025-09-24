import React from 'react';
import { ProCard, ProList } from '@ant-design/pro-components';
import type { ProListProps } from '@ant-design/pro-components';

export interface ProListPanelProps<T extends Record<string, any>, ValueType extends Record<string, any> = Record<string, any>>
  extends ProListProps<T, ValueType> {
  title?: React.ReactNode;
  extra?: React.ReactNode;
}

export const ProListPanel = <T extends Record<string, any>, ValueType extends Record<string, any> = Record<string, any>>({
  title,
  extra,
  ...rest
}: ProListPanelProps<T, ValueType>) => {
  return (
    <ProCard bordered headerBordered size="small" title={title} extra={extra} bodyStyle={{ padding: 0 }}>
      <ProList<T, ValueType> rowKey="id" ghost {...rest} />
    </ProCard>
  );
};

export default ProListPanel;
