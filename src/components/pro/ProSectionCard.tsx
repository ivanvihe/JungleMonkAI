import React from 'react';
import { ProCard } from '@ant-design/pro-components';
import type { ProCardProps } from '@ant-design/pro-components';

export interface ProSectionCardProps extends ProCardProps {
  "aria-label"?: string;
}

export const ProSectionCard: React.FC<ProSectionCardProps> = ({
  children,
  ...rest
}) => {
  return (
    <ProCard
      bordered
      ghost
      headerBordered
      size="small"
      bodyStyle={{ padding: 16 }}
      {...rest}
    >
      {children}
    </ProCard>
  );
};

export default ProSectionCard;
