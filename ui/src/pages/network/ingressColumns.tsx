import React from 'react';
import { Space, Tag, Tooltip, Button, Popconfirm, Typography } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import { IngressService } from '../../services/ingressService';
import type { Ingress } from '../../types';
import type { ColumnsType } from 'antd/es/table';
import type { TFunction } from 'i18next';

const { Text, Link } = Typography;

export interface IngressColumnHandlers {
  onViewYAML: (ingress: Ingress) => void;
  onEdit: (ingress: Ingress) => void;
  onDelete: (ingress: Ingress) => void;
}

export interface IngressColumnSortState {
  sortField: string;
  sortOrder: 'ascend' | 'descend' | null;
}

export function getIngressColumns(
  t: TFunction,
  handlers: IngressColumnHandlers,
  sortState: IngressColumnSortState,
): ColumnsType<Ingress> {
  return [
    {
      title: t('network:ingress.columns.name'),
      dataIndex: 'name',
      key: 'name',
      fixed: 'left' as const,
      width: 200,
      sorter: true,
      sortOrder: sortState.sortField === 'name' ? sortState.sortOrder : null,
      render: (name: string, record: Ingress) => (
        <div>
          <Space>
            <Link strong onClick={() => handlers.onViewYAML(record)}>
              {name}
            </Link>
            {IngressService.hasTLS(record) && (
              <Tooltip title={t('network:ingress.columns.tlsEnabled')}>
                <SafetyCertificateOutlined style={{ color: '#52c41a' }} />
              </Tooltip>
            )}
          </Space>
          <div style={{ fontSize: 12, color: '#999' }}>
            {record.namespace}
          </div>
        </div>
      ),
    },
    {
      title: t('common:table.namespace'),
      dataIndex: 'namespace',
      key: 'namespace',
      width: 130,
      sorter: true,
      sortOrder: sortState.sortField === 'namespace' ? sortState.sortOrder : null,
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: 'IngressClass',
      dataIndex: 'ingressClassName',
      key: 'ingressClassName',
      width: 150,
      render: (ingressClassName?: string) => (
        <Tag color={IngressService.getIngressClassColor(ingressClassName)}>
          {IngressService.formatIngressClass(ingressClassName)}
        </Tag>
      ),
    },
    {
      title: t('network:ingress.columns.loadBalancer'),
      key: 'loadBalancer',
      width: 200,
      render: (_: unknown, record: Ingress) => {
        const lbs = IngressService.formatLoadBalancers(record);
        return (
          <div>
            {lbs.slice(0, 2).map((lb, idx) => (
              <div key={idx} style={{ fontSize: 12 }}>
                {lb}
              </div>
            ))}
            {lbs.length > 2 && (
              <Tooltip title={lbs.slice(2).join(', ')}>
                <Text type="secondary" style={{ fontSize: 12, cursor: 'pointer' }}>
                  +{lbs.length - 2} {t('network:ingress.columns.more')}
                </Text>
              </Tooltip>
            )}
          </div>
        );
      },
    },
    {
      title: 'Hosts',
      key: 'hosts',
      width: 200,
      render: (_: unknown, record: Ingress) => {
        const hosts = IngressService.getHosts(record);
        return (
          <div>
            {hosts.slice(0, 2).map((host, idx) => (
              <div key={idx} style={{ fontSize: 12 }}>
                {host}
              </div>
            ))}
            {hosts.length > 2 && (
              <Tooltip title={hosts.slice(2).join(', ')}>
                <Text type="secondary" style={{ fontSize: 12, cursor: 'pointer' }}>
                  +{hosts.length - 2} {t('network:ingress.columns.more')}
                </Text>
              </Tooltip>
            )}
          </div>
        );
      },
    },
    {
      title: t('network:ingress.columns.backends'),
      key: 'backends',
      width: 300,
      render: (_: unknown, record: Ingress) => {
        const backends = IngressService.formatBackends(record);
        return (
          <div style={{ wordBreak: 'break-word', whiteSpace: 'normal' }}>
            {backends.map((backend, idx) => (
              <div key={idx} style={{ fontSize: 12, marginBottom: idx < backends.length - 1 ? 4 : 0 }}>
                {backend}
              </div>
            ))}
          </div>
        );
      },
    },
    {
      title: t('common:table.createdAt'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      sorter: true,
      sortOrder: sortState.sortField === 'createdAt' ? sortState.sortOrder : null,
      render: (createdAt: string) => {
        if (!createdAt) return '-';
        const date = new Date(createdAt);
        const formatted = date.toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }).replace(/\//g, '-');
        return <span>{formatted}</span>;
      },
    },
    {
      title: t('common:table.actions'),
      key: 'action',
      fixed: 'right' as const,
      width: 150,
      render: (_: unknown, record: Ingress) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            onClick={() => handlers.onViewYAML(record)}
          >
            YAML
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => handlers.onEdit(record)}
          >
            {t('common:actions.edit')}
          </Button>
          <Popconfirm
            title={t('network:ingress.messages.confirmDeleteItem')}
            description={t('network:ingress.messages.confirmDeleteDesc', { name: record.name })}
            onConfirm={() => handlers.onDelete(record)}
            okText={t('common:actions.confirm')}
            cancelText={t('common:actions.cancel')}
          >
            <Button
              type="link"
              size="small"
              danger
            >
              {t('common:actions.delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];
}
