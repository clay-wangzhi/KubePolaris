import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Button,
  Space,
  Select,
  Switch,
  InputNumber,
  message,
  Typography,
  Alert,
  Spin,
  Row,
  Col,
} from 'antd';
import {
  ArrowLeftOutlined,
  ReloadOutlined,
  DownloadOutlined,
  ClearOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
} from '@ant-design/icons';
import { PodService } from '../../services/podService';
import type { PodInfo } from '../../services/podService';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;
const { Option } = Select;

// WebSocket消息类型
interface LogMessage {
  type: 'connected' | 'start' | 'log' | 'end' | 'error' | 'closed';
  data?: string;
  message?: string;
}

type PodLogsProps = Record<string, never>;

const PodLogs: React.FC<PodLogsProps> = () => {
  const { clusterId, namespace, name } = useParams<{
    clusterId: string;
    namespace: string;
    name: string;
  }>();
  const navigate = useNavigate();
  
const { t } = useTranslation(['pod', 'common']);
const [pod, setPod] = useState<PodInfo | null>(null);
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(false);
  const [following, setFollowing] = useState(false);
  const [connected, setConnected] = useState(false);
  
  // 日志选项
  const [selectedContainer, setSelectedContainer] = useState<string>('');
  const [previous, setPrevious] = useState(false);
  const [tailLines, setTailLines] = useState<number>(100);
  const [sinceSeconds, setSinceSeconds] = useState<number | undefined>(undefined);
  
  const logsRef = useRef<HTMLPreElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // 获取Pod详情
  const fetchPodDetail = useCallback(async () => {
    if (!clusterId || !namespace || !name) return;
    
    try {
      const response = await PodService.getPodDetail(clusterId, namespace, name);
      
      setPod(response.pod);
      if (!selectedContainer && response.pod.containers.length > 0) {
        setSelectedContainer(response.pod.containers[0].name);
      }
    } catch (error) {
      console.error('获取Pod详情失败:', error);
      message.error(t('pod:logs.fetchPodError'));
    }
  }, [clusterId, namespace, name, selectedContainer]);

  // 获取日志
  const fetchLogs = useCallback(async (isFollow = false) => {
    if (!clusterId || !namespace || !name) return;
    
    setLoading(true);
    try {
      const response = await PodService.getPodLogs(
        clusterId,
        namespace,
        name,
        selectedContainer || undefined,
        isFollow,
        previous,
        tailLines,
        sinceSeconds
      );
      
      if (isFollow) {
        setLogs(prev => prev + response.logs);
      } else {
        setLogs(response.logs);
      }
      
      setTimeout(() => {
        if (logsRef.current) {
          logsRef.current.scrollTop = logsRef.current.scrollHeight;
        }
      }, 100);
    } catch (error) {
      console.error('获取日志失败:', error);
      message.error(t('pod:logs.fetchError'));
    } finally {
      setLoading(false);
    }
  }, [clusterId, namespace, name, selectedContainer, previous, tailLines, sinceSeconds]);

  // 开始/停止跟踪日志
  const toggleFollow = () => {
    if (following) {
      // 停止跟踪 - 关闭WebSocket连接
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setFollowing(false);
      setConnected(false);
    } else {
      // 开始跟踪 - 建立WebSocket连接
      if (!clusterId || !namespace || !name) {
        message.error(t('pod:logs.missingParams'));
        return;
      }
      
      setFollowing(true);
      setLoading(true);
      
      try {
        // 创建WebSocket连接
        const ws = PodService.createLogStream(clusterId, namespace, name, {
          container: selectedContainer || undefined,
          previous,
          tailLines,
          sinceSeconds,
        });
        
        wsRef.current = ws;
        
        // WebSocket事件处理
        ws.onopen = () => {
          console.log('WebSocket连接已建立');
          setConnected(true);
          setLoading(false);
        };
        
        ws.onmessage = (event) => {
          try {
            const msg: LogMessage = JSON.parse(event.data);
            
            switch (msg.type) {
              case 'connected':
                message.success(t('pod:logs.connectedToStream'));
                break;
                
              case 'start':
                break;
                
              case 'log':
                // 追加日志内容
                if (msg.data) {
                  setLogs((prev) => prev + msg.data);
                  
                  // 自动滚动到底部
                  setTimeout(() => {
                    if (logsRef.current) {
                      logsRef.current.scrollTop = logsRef.current.scrollHeight;
                    }
                  }, 0);
                }
                break;
                
              case 'end':
                message.info(t('pod:logs.streamEnded'));
                setFollowing(false);
                setConnected(false);
                break;
                
              case 'error':
                message.error(msg.message || t('pod:logs.streamError'));
                setFollowing(false);
                setConnected(false);
                break;
                
              case 'closed':
                setFollowing(false);
                setConnected(false);
                break;
            }
          } catch (error) {
            console.error('解析WebSocket消息失败:', error);
          }
        };
        
        ws.onerror = (error) => {
          console.error('WebSocket错误:', error);
          message.error(t('pod:logs.wsConnectionError'));
          setFollowing(false);
          setConnected(false);
          setLoading(false);
        };
        
        ws.onclose = () => {
          setFollowing(false);
          setConnected(false);
          setLoading(false);
        };
      } catch (error) {
        console.error('创建WebSocket连接失败:', error);
        message.error(t('pod:logs.createConnectionFailed'));
        setFollowing(false);
        setLoading(false);
      }
    }
  };

  // 清空日志
  const clearLogs = () => {
    setLogs('');
  };

  // 下载日志
  const downloadLogs = () => {
    if (!logs) {
      message.warning(t('pod:logs.noContentToDownload'));
      return;
    }
    
    const blob = new Blob([logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${namespace}-${name}-${selectedContainer || 'all'}-logs.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    message.success(t('pod:logs.downloadSuccess'));
  };

  // 刷新日志
  const refreshLogs = () => {
    fetchLogs(false);
  };

  useEffect(() => {
    fetchPodDetail();
  }, [fetchPodDetail]);

  useEffect(() => {
    if (selectedContainer) {
      fetchLogs(false);
    }
  }, [selectedContainer, previous, tailLines, sinceSeconds, fetchLogs]);

  // 组件卸载时清理WebSocket连接
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  if (!pod) {
    return <div>{t('pod:logs.loading')}</div>;
  }

  return (
    <div style={{ padding: '24px', height: 'calc(100vh - 64px)' }}>
      {/* 页面头部 */}
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(`/clusters/${clusterId}/pods/${namespace}/${name}`)}
          >
            {t('pod:logs.back')}
          </Button>
          <Title level={3} style={{ margin: 0 }}>
            {t('pod:logs.title')}
          </Title>
          <Text type="secondary">
            {namespace}/{name}
          </Text>
        </Space>
        
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col span={4}>
            <Select
              placeholder={t('pod:logs.selectContainer')}
              value={selectedContainer}
              onChange={setSelectedContainer}
              style={{ width: '100%' }}
            >
              {pod.containers.map(container => (
                <Option key={container.name} value={container.name}>
                  {container.name}
                </Option>
              ))}
            </Select>
          </Col>
          
          <Col span={3}>
            <Space>
              <Text>{t('pod:logs.tailLines')}:</Text>
              <InputNumber
                min={10}
                max={10000}
                value={tailLines}
                onChange={(value) => setTailLines(value || 100)}
                style={{ width: 80 }}
              />
            </Space>
          </Col>
          
          <Col span={3}>
            <Space>
              <Text>{t('pod:logs.sinceSeconds')}:</Text>
              <InputNumber
                min={1}
                placeholder={t('pod:logs.allTime')}
                value={sinceSeconds}
                onChange={(value) => setSinceSeconds(value ?? undefined)}
                style={{ width: 100 }}
              />
            </Space>
          </Col>
          
          <Col span={3}>
            <Space>
              <Text>{t('pod:logs.previousContainer')}:</Text>
              <Switch
                checked={previous}
                onChange={setPrevious}
                size="small"
              />
            </Space>
          </Col>
          
          <Col span={11}>
            <Space>
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                onClick={refreshLogs}
                loading={loading}
              >
                {t('pod:logs.refresh')}
              </Button>
              
              <Button
                icon={following ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                onClick={toggleFollow}
                type={following ? 'default' : 'primary'}
              >
                {following ? t('pod:logs.stopFollow') : t('pod:logs.startFollow')}
              </Button>
              
              <Button
                icon={<DownloadOutlined />}
                onClick={downloadLogs}
                disabled={!logs}
              >
                {t('pod:logs.downloadBtn')}
              </Button>
              
              <Button
                icon={<ClearOutlined />}
                onClick={clearLogs}
                disabled={!logs}
              >
                {t('pod:logs.clearBtn')}
              </Button>
            </Space>
          </Col>
        </Row>
      </div>

      {/* 状态提示 */}
      {following && connected && (
        <Alert
          message={t('pod:logs.followingAlert')}
          description={t('pod:logs.followingAlertDesc')}
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}
      
      {following && !connected && (
        <Alert
          message={t('pod:logs.connectingAlert')}
          description={t('pod:logs.connectingAlertDesc')}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {/* 日志内容 */}
      <Card style={{ height: 'calc(100% - 140px)' }}>
        <Spin spinning={loading} tip={t('pod:logs.loadingLogs')}>
          <pre
            ref={logsRef}
            style={{
              height: '100%',
              overflow: 'auto',
              backgroundColor: '#1e1e1e',
              color: '#d4d4d4',
              padding: '16px',
              margin: 0,
              fontSize: '13px',
              fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
              lineHeight: '1.4',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {logs || t('pod:logs.noLogContent')}
          </pre>
        </Spin>
      </Card>
    </div>
  );
};

export default PodLogs;