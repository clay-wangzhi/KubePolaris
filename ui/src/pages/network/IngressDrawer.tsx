import React from 'react';
import { Drawer, Button, Space, Checkbox } from 'antd';
import { useTranslation } from 'react-i18next';

interface IngressDrawerProps {
  visible: boolean;
  visibleColumns: string[];
  onVisibleColumnsChange: (columns: string[]) => void;
  onClose: () => void;
  onSave: () => void;
}

const COLUMN_KEYS = [
  'namespace',
  'ingressClassName',
  'loadBalancer',
  'hosts',
  'backends',
  'createdAt',
] as const;

const IngressDrawer: React.FC<IngressDrawerProps> = ({
  visible,
  visibleColumns,
  onVisibleColumnsChange,
  onClose,
  onSave,
}) => {
  const { t } = useTranslation(['network', 'common']);

  const columnLabelMap: Record<string, string> = {
    namespace: t('network:ingress.columnSettings.namespace'),
    ingressClassName: t('network:ingress.columnSettings.ingressClassName'),
    loadBalancer: t('network:ingress.columnSettings.loadBalancer'),
    hosts: 'Hosts',
    backends: t('network:ingress.columnSettings.backends'),
    createdAt: t('network:ingress.columnSettings.createdAt'),
  };

  const handleToggle = (key: string, checked: boolean) => {
    if (checked) {
      onVisibleColumnsChange([...visibleColumns, key]);
    } else {
      onVisibleColumnsChange(visibleColumns.filter(c => c !== key));
    }
  };

  return (
    <Drawer
      title={t('common:search.columnSettings')}
      placement="right"
      width={400}
      open={visible}
      onClose={onClose}
      footer={
        <div style={{ textAlign: 'right' }}>
          <Space>
            <Button onClick={onClose}>{t('common:actions.cancel')}</Button>
            <Button type="primary" onClick={onSave}>{t('common:actions.confirm')}</Button>
          </Space>
        </div>
      }
    >
      <div style={{ marginBottom: 16 }}>
        <p style={{ marginBottom: 8, color: '#666' }}>{t('common:search.selectColumns')}</p>
        <Space direction="vertical" style={{ width: '100%' }}>
          {COLUMN_KEYS.map((key) => (
            <Checkbox
              key={key}
              checked={visibleColumns.includes(key)}
              onChange={(e) => handleToggle(key, e.target.checked)}
            >
              {columnLabelMap[key]}
            </Checkbox>
          ))}
        </Space>
      </div>
    </Drawer>
  );
};

export default IngressDrawer;
