import React from 'react';
import {
  Modal,
  Descriptions,
  Typography,
  Drawer,
  Space,
  Button,
  Checkbox,
} from 'antd';
import type { EndpointsData } from './serviceTypes';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

// --- YAML 查看 Modal ---

interface YAMLViewModalProps {
  visible: boolean;
  yaml: string;
  loading: boolean;
  onClose: () => void;
}

export const YAMLViewModal: React.FC<YAMLViewModalProps> = ({
  visible,
  yaml,
  loading,
  onClose,
}) => {
  const { t } = useTranslation(['common']);

  return (
    <Modal
      title="Service YAML"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={800}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <span>{t('common:messages.loading')}</span>
        </div>
      ) : (
        <pre style={{ maxHeight: 600, overflow: 'auto', background: '#f5f5f5', padding: 16 }}>
          {yaml}
        </pre>
      )}
    </Modal>
  );
};

// --- Endpoints 查看 Modal ---

interface EndpointsViewModalProps {
  visible: boolean;
  endpoints: EndpointsData | null;
  loading: boolean;
  onClose: () => void;
}

export const EndpointsViewModal: React.FC<EndpointsViewModalProps> = ({
  visible,
  endpoints,
  loading,
  onClose,
}) => {
  const { t } = useTranslation(['network', 'common']);

  return (
    <Modal
      title="Service Endpoints"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={800}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <span>{t('common:messages.loading')}</span>
        </div>
      ) : endpoints ? (
        <Descriptions column={1} bordered>
          <Descriptions.Item label={t('network:service.endpoints.name')}>{endpoints.name}</Descriptions.Item>
          <Descriptions.Item label={t('network:service.endpoints.namespace')}>{endpoints.namespace}</Descriptions.Item>
          <Descriptions.Item label={t('network:service.endpoints.subsets')}>
            {endpoints.subsets && endpoints.subsets.length > 0 ? (
              endpoints.subsets.map((subset, idx) => (
                <div key={idx} style={{ marginBottom: 16 }}>
                  <Text strong>{t('network:service.endpoints.addresses')}:</Text>
                  {subset.addresses?.map((addr, addrIdx) => (
                    <div key={addrIdx} style={{ marginLeft: 16 }}>
                      {addr.ip} {addr.nodeName && `(${t('network:service.endpoints.node')}: ${addr.nodeName})`}
                    </div>
                  ))}
                  <Text strong style={{ marginTop: 8, display: 'block' }}>{t('network:service.endpoints.ports')}:</Text>
                  {subset.ports?.map((port, portIdx) => (
                    <div key={portIdx} style={{ marginLeft: 16 }}>
                      {port.name && `${port.name}: `}{port.port}/{port.protocol}
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <Text type="secondary">{t('network:service.endpoints.none')}</Text>
            )}
          </Descriptions.Item>
        </Descriptions>
      ) : (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Text type="secondary">{t('network:service.messages.noEndpoints')}</Text>
        </div>
      )}
    </Modal>
  );
};

// --- 列设置抽屉 ---

interface ColumnSettingsDrawerProps {
  visible: boolean;
  visibleColumns: string[];
  onVisibleColumnsChange: (columns: string[]) => void;
  onClose: () => void;
  onSave: () => void;
}

const COLUMN_OPTIONS = [
  'namespace', 'type', 'access', 'ports', 'selector', 'createdAt',
] as const;

export const ColumnSettingsDrawer: React.FC<ColumnSettingsDrawerProps> = ({
  visible,
  visibleColumns,
  onVisibleColumnsChange,
  onClose,
  onSave,
}) => {
  const { t } = useTranslation(['network', 'common']);

  const handleToggle = (column: string, checked: boolean) => {
    if (checked) {
      onVisibleColumnsChange([...visibleColumns, column]);
    } else {
      onVisibleColumnsChange(visibleColumns.filter(c => c !== column));
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
          {COLUMN_OPTIONS.map(col => (
            <Checkbox
              key={col}
              checked={visibleColumns.includes(col)}
              onChange={e => handleToggle(col, e.target.checked)}
            >
              {t(`network:service.columnSettings.${col}`)}
            </Checkbox>
          ))}
        </Space>
      </div>
    </Drawer>
  );
};
