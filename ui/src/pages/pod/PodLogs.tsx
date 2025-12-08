import React, { useState, useEffect, useRef } from 'react';
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

const { Title, Text } = Typography;
const { Option } = Select;

// WebSocket消息类型
interface LogMessage {
  type: 'connected' | 'start' | 'log' | 'end' | 'error' | 'closed';
  data?: string;
  message?: string;
}

interface PodLogsProps {}

const PodLogs: React.FC<PodLogsProps> = () => {
  const { clusterId, namespace, name } = useParams<{
    clusterId: string;
    namespace: string;
    name: string;
  }>();
  const navigate = useNavigate();
  
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
  const fetchPodDetail = async () => {
    if (!clusterId || !namespace || !name) return;
    
    try {
      const response = await PodService.getPodDetail(clusterId, namespace, name);
      
      if (response.code === 200) {
        setPod(response.data.pod);
        // 如果没有选择容器且有容器列表，默认选择第一个
        if (!selectedContainer && response.data.pod.containers.length > 0) {
          setSelectedContainer(response.data.pod.containers[0].name);
        }
      } else {
        message.error(response.message || '获取Pod详情失败');
      }
    } catch (error) {
      console.error('获取Pod详情失败:', error);
      message.error('获取Pod详情失败');
    }
  };

  // 获取日志
  const fetchLogs = async (isFollow = false) => {
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
      
      if (response.code === 200) {
        if (isFollow) {
          // 追加日志内容
          setLogs(prev => prev + response.data.logs);
        } else {
          // 替换日志内容
          setLogs(response.data.logs);
        }
        
        // 自动滚动到底部
        setTimeout(() => {
          if (logsRef.current) {
            logsRef.current.scrollTop = logsRef.current.scrollHeight;
          }
        }, 100);
      } else {
        message.error(response.message || '获取日志失败');
      }
    } catch (error) {
      console.error('获取日志失败:', error);
      message.error('获取日志失败');
    } finally {
      setLoading(false);
    }
  };

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
        message.error('缺少必要参数');
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
                message.success('已连接到日志流');
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
                message.info('日志流已结束');
                setFollowing(false);
                setConnected(false);
                break;
                
              case 'error':
                message.error(msg.message || '日志流错误');
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
          message.error('WebSocket连接错误');
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
        message.error('创建连接失败');
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
      message.warning('没有日志内容可下载');
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
    
    message.success('日志下载成功');
  };

  // 刷新日志
  const refreshLogs = () => {
    fetchLogs(false);
  };

  useEffect(() => {
    fetchPodDetail();
  }, [clusterId, namespace, name]);

  useEffect(() => {
    if (selectedContainer) {
      fetchLogs(false);
    }
  }, [selectedContainer, previous, tailLines, sinceSeconds]);

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
    return <div>加载中...</div>;
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
            返回
          </Button>
          <Title level={3} style={{ margin: 0 }}>
            Pod 日志
          </Title>
          <Text type="secondary">
            {namespace}/{name}
          </Text>
        </Space>
        
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col span={4}>
            <Select
              placeholder="选择容器"
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
              <Text>显示行数:</Text>
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
              <Text>时间范围(秒):</Text>
              <InputNumber
                min={1}
                placeholder="全部"
                value={sinceSeconds}
                onChange={(value) => setSinceSeconds(value ?? undefined)}
                style={{ width: 100 }}
              />
            </Space>
          </Col>
          
          <Col span={3}>
            <Space>
              <Text>前一个容器:</Text>
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
                刷新
              </Button>
              
              <Button
                icon={following ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                onClick={toggleFollow}
                type={following ? 'default' : 'primary'}
              >
                {following ? '停止跟踪' : '跟踪日志'}
              </Button>
              
              <Button
                icon={<DownloadOutlined />}
                onClick={downloadLogs}
                disabled={!logs}
              >
                下载
              </Button>
              
              <Button
                icon={<ClearOutlined />}
                onClick={clearLogs}
                disabled={!logs}
              >
                清空
              </Button>
            </Space>
          </Col>
        </Row>
      </div>

      {/* 状态提示 */}
      {following && connected && (
        <Alert
          message="正在实时跟踪日志"
          description="通过WebSocket实时接收日志流，点击'停止跟踪'按钮可停止接收。"
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}
      
      {following && !connected && (
        <Alert
          message="正在连接..."
          description="正在建立WebSocket连接，请稍候..."
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {/* 日志内容 */}
      <Card style={{ height: 'calc(100% - 140px)' }}>
        <Spin spinning={loading} tip="加载日志中...">
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
            {logs || '暂无日志内容'}
          </pre>
        </Spin>
      </Card>
    </div>
  );
};

export default PodLogs;