import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Card,
  Button,
  Space,
  Select,
  message,
  Typography,
  Alert,
  Row,
  Col,
  Spin,
} from 'antd';
import {
  PlayCircleOutlined,
  StopOutlined,
  ClearOutlined,
  FullscreenOutlined,
} from '@ant-design/icons';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { ClipboardAddon } from '@xterm/addon-clipboard';
import 'xterm/css/xterm.css';
import { PodService } from '../../services/podService';
import type { PodInfo } from '../../services/podService';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;
const { Option } = Select;

type PodTerminalProps = Record<string, never>;

const PodTerminal: React.FC<PodTerminalProps> = () => {
  const { clusterId, namespace, name } = useParams<{
    clusterId: string;
    namespace: string;
    name: string;
  }>();
  
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const websocket = useRef<WebSocket | null>(null);
  
const { t } = useTranslation(['pod', 'common']);
const [pod, setPod] = useState<PodInfo | null>(null);
  const [selectedContainer, setSelectedContainer] = useState<string>('');
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const connectedRef = useRef(false);

  // 显示欢迎信息
  const showWelcomeMessage = useCallback(() => {
    if (!terminal.current) return;
    
    terminal.current.clear();
    terminal.current.writeln('\x1b[32m╭─────────────────────────────────────────────────────────────╮\x1b[0m');
    terminal.current.writeln('\x1b[32m│                    KubePolaris Pod Terminal                 │\x1b[0m');
    terminal.current.writeln('\x1b[32m╰─────────────────────────────────────────────────────────────╯\x1b[0m');
    terminal.current.writeln('');
    terminal.current.writeln(`\x1b[36mPod:\x1b[0m ${namespace}/${name}`);
    terminal.current.writeln(`\x1b[36mCluster:\x1b[0m ${clusterId}`);
    terminal.current.writeln('');
    terminal.current.writeln(`\x1b[33m${t('terminal.welcomeSelectContainer')}\x1b[0m`);
    terminal.current.writeln('');
  }, [namespace, name, clusterId]);

  // 处理终端输入
  const handleTerminalInput = useCallback((data: string) => {
    if (!connectedRef.current || !websocket.current) return;

    if (websocket.current.readyState === WebSocket.OPEN) {
      websocket.current.send(JSON.stringify({ 
        type: 'input', 
        data: data 
      }));
    }
  }, []);

  // 获取Pod详情
  const fetchPodDetail = useCallback(async () => {
    if (!clusterId || !namespace || !name) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      const response = await PodService.getPodDetail(clusterId, namespace, name);
      
      if (response.code === 200) {
        setPod(response.data.pod);
        if (!selectedContainer && response.data.pod.containers.length > 0) {
          setSelectedContainer(response.data.pod.containers[0].name);
        }
      } else {
        message.error(response.message || t('pod:terminal.fetchPodError'));
      }
    } catch (error) {
      console.error('获取Pod详情失败:', error);
      message.error(t('pod:terminal.fetchPodError'));
    } finally {
      setLoading(false);
    }
  }, [clusterId, namespace, name, selectedContainer]);

  // 初始化终端 - 只在 pod 加载完成后初始化
  useEffect(() => {
    // 如果 pod 还没加载完成，不初始化终端
    if (!pod || !terminalRef.current) {
      return;
    }

    // 如果终端已经初始化，不重复初始化
    if (terminal.current) {
      return;
    }

    const initTerminal = () => {
      if (terminalRef.current && !terminal.current) {
        try {
          terminal.current = new Terminal({
            cursorBlink: true,
            fontSize: 14,
            fontFamily: 'Monaco, Menlo, "Ubuntu Mono", Consolas, monospace',
            theme: {
              background: '#1e1e1e',
              foreground: '#d4d4d4',
              cursor: '#ffffff',
              selectionBackground: '#264f78',
            },
            cols: 120,
            rows: 30,
            allowTransparency: true,
            rightClickSelectsWord: true,
          });

          // 添加插件
          fitAddon.current = new FitAddon();
          terminal.current.loadAddon(fitAddon.current);
          terminal.current.loadAddon(new WebLinksAddon());
          
          // 添加剪贴板支持
          try {
            const clipboardAddon = new ClipboardAddon();
            terminal.current.loadAddon(clipboardAddon);
          } catch (e) {
            console.warn('Clipboard addon not available:', e);
          }

          terminal.current.open(terminalRef.current);
          
          // 等待 DOM 完全渲染后再 fit
          const fitTerminal = () => {
            if (fitAddon.current && terminal.current && terminalRef.current) {
              try {
                // 确保容器有尺寸
                const rect = terminalRef.current.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                  fitAddon.current.fit();
                } else {
                  // 如果容器还没有尺寸，再等一会
                  setTimeout(fitTerminal, 100);
                }
              } catch (e) {
                console.warn('Fit addon error:', e);
              }
            }
          };

          // 延迟执行 fit 和显示欢迎信息
          setTimeout(() => {
            fitTerminal();
            setTimeout(() => {
              showWelcomeMessage();
            }, 200);
          }, 100);

          // 设置终端输入处理
          terminal.current.onData((data) => {
            handleTerminalInput(data);
          });

        } catch (error) {
          console.error('初始化终端失败:', error);
          message.error(t('pod:terminal.initFailed'));
        }
      }
    };

    // 延迟初始化，确保 DOM 已经渲染
    const timer = setTimeout(initTerminal, 100);

    // 清理函数
    return () => {
      clearTimeout(timer);
      if (websocket.current) {
        websocket.current.close();
      }
      if (terminal.current) {
        terminal.current.dispose();
        terminal.current = null;
      }
    };
  }, [pod, showWelcomeMessage, handleTerminalInput]);

  // 连接终端
  const connectTerminal = () => {
    if (!clusterId || !namespace || !name || !selectedContainer) {
      message.error(t('pod:terminal.missingParams'));
      return;
    }
    
    if (pod?.status !== 'Running') {
      message.error(t('pod:terminal.mustBeRunning'));
      return;
    }
    
    // 获取认证 token
    const token = localStorage.getItem('token');
    if (!token) {
      message.error(t('pod:terminal.notLoggedIn'));
      return;
    }
    
    setConnecting(true);
    
    if (terminal.current) {
      terminal.current.clear();
      terminal.current.writeln('\x1b[33m正在连接终端...\x1b[0m');
    }
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // 在 URL 中添加 token 参数用于 WebSocket 认证
    const wsUrl = `${protocol}//${window.location.hostname}:8080/ws/clusters/${clusterId}/pods/${namespace}/${name}/terminal?container=${selectedContainer}&token=${encodeURIComponent(token)}`;
    
    try {
      const ws = new WebSocket(wsUrl);
      websocket.current = ws;
      
      ws.onopen = () => {
        setConnected(true);
        setConnecting(false);
        connectedRef.current = true;
        message.success(t('pod:terminal.connectSuccess'));
        
        if (terminal.current) {
          terminal.current.clear();
          terminal.current.writeln(`\x1b[32m✓ 已连接到 Pod: ${namespace}/${name}\x1b[0m`);
          terminal.current.writeln(`\x1b[32m✓ 容器: ${selectedContainer}\x1b[0m`);
          terminal.current.writeln(`\x1b[32m✓ 集群: ${clusterId}\x1b[0m`);
          terminal.current.writeln('');
        }
        
        // 发送初始终端尺寸
        try {
          if (fitAddon.current && terminal.current) {
            const dimensions = fitAddon.current.proposeDimensions();
            if (dimensions) {
              ws.send(JSON.stringify({ 
                type: 'resize', 
                cols: dimensions.cols, 
                rows: dimensions.rows 
              }));
            }
          }
        } catch (e) {
          console.log('发送resize消息失败:', e);
        }
      };
      
      ws.onmessage = (event) => {
        if (!terminal.current) return;
        
        const raw = event.data;
        try {
          const msg = JSON.parse(raw);
          if (msg && typeof msg === 'object' && 'type' in msg) {
            switch (msg.type) {
              case 'connected':
                terminal.current.writeln(`\x1b[32m${msg.data}\x1b[0m`);
                break;
              case 'data':
                terminal.current.write(msg.data || '');
                break;
              case 'error':
                terminal.current.writeln(`\x1b[31m[ERROR] ${msg.data}\x1b[0m`);
                break;
              case 'disconnected':
                terminal.current.writeln(`\x1b[33m${msg.data}\x1b[0m`);
                break;
              default:
                terminal.current.write(String(msg.data ?? ''));
                break;
            }
          } else {
            terminal.current.write(String(raw ?? ''));
          }
        } catch {
          terminal.current.write(String(raw ?? ''));
        }
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket错误:', error);
        message.error(t('pod:terminal.connectError'));
        setConnected(false);
        setConnecting(false);
        connectedRef.current = false;
        
        if (terminal.current) {
          terminal.current.writeln('\x1b[31m连接出错\x1b[0m');
        }
      };
      
      ws.onclose = () => {
        setConnected(false);
        setConnecting(false);
        connectedRef.current = false;
        message.info(t('pod:terminal.disconnectedMsg'));
        
        if (terminal.current) {
          terminal.current.writeln('\x1b[31m\r\n连接已断开\x1b[0m');
        }
      };
      
    } catch (error) {
      console.error('创建WebSocket连接失败:', error);
      message.error(t('pod:terminal.createFailed'));
      setConnecting(false);
      
      if (terminal.current) {
        terminal.current.writeln('\x1b[31m创建连接失败\x1b[0m');
      }
    }
  };

  // 断开终端连接
  const disconnectTerminal = () => {
    if (websocket.current) {
      websocket.current.close();
      websocket.current = null;
    }
    setConnected(false);
    connectedRef.current = false;
    
    if (terminal.current) {
      terminal.current.writeln('\x1b[33m\r\n手动断开连接\x1b[0m');
    }
  };

  // 清空终端
  const clearTerminal = () => {
    if (terminal.current) {
      terminal.current.clear();
    }
  };

  // 全屏模式
  const toggleFullscreen = () => {
    if (terminalRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        terminalRef.current.requestFullscreen();
      }
    }
  };

  // 窗口大小变化时重新调整终端大小
  useEffect(() => {
    const handleResize = () => {
      if (fitAddon.current && terminal.current) {
        setTimeout(() => {
          try {
            fitAddon.current?.fit();
            
            // 发送新的终端尺寸
            if (connected && websocket.current && websocket.current.readyState === WebSocket.OPEN) {
              const dimensions = fitAddon.current?.proposeDimensions();
              if (dimensions) {
                websocket.current.send(JSON.stringify({
                  type: 'resize',
                  cols: dimensions.cols,
                  rows: dimensions.rows
                }));
              }
            }
          } catch (e) {
            console.warn('Resize error:', e);
          }
        }, 100);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [connected]);

  useEffect(() => {
    fetchPodDetail();
  }, [fetchPodDetail]);

  // 参数验证
  if (!clusterId || !namespace || !name) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        flexDirection: 'column',
        gap: 16
      }}>
        <Alert
          message={t('pod:terminal.paramError')}
          description={t('pod:terminal.paramErrorDesc')}
          type="error"
          showIcon
        />
      </div>
    );
  }

  if (loading || !pod) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        <Spin size="large" tip={t('common:messages.loading')} />
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* 页面头部 */}
      <div style={{ marginBottom: 16, flexShrink: 0 }}>
        <Space>
          <Title level={3} style={{ margin: 0 }}>
            {t('pod:terminal.title')}
          </Title>
          <Text type="secondary">
            {namespace}/{name}
          </Text>
        </Space>
        
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col span={4}>
            <Select
              placeholder={t('pod:terminal.selectContainer')}
              value={selectedContainer}
              onChange={setSelectedContainer}
              style={{ width: '100%' }}
              disabled={connected}
            >
              {pod.containers.map(container => (
                <Option key={container.name} value={container.name}>
                  {container.name}
                </Option>
              ))}
            </Select>
          </Col>
          
          <Col span={20}>
            <Space>
              {!connected ? (
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  onClick={connectTerminal}
                  loading={connecting}
                  disabled={!selectedContainer || pod.status !== 'Running'}
                >
                  {t('pod:terminal.connect')}
                </Button>
              ) : (
                <Button
                  danger
                  icon={<StopOutlined />}
                  onClick={disconnectTerminal}
                >
                  {t('pod:terminal.disconnect')}
                </Button>
              )}
              
              <Button
                icon={<ClearOutlined />}
                onClick={clearTerminal}
              >
                {t('pod:terminal.clearBtn')}
              </Button>
              
              <Button
                icon={<FullscreenOutlined />}
                onClick={toggleFullscreen}
              >
                {t('pod:terminal.fullscreen')}
              </Button>
            </Space>
          </Col>
        </Row>
      </div>

      {/* 状态提示 */}
      {pod.status !== 'Running' && (
        <Alert
          message={t('pod:terminal.podStatusAbnormal')}
          description={t('pod:terminal.podStatusAbnormalDesc', { status: pod.status })}
          type="warning"
          showIcon
          style={{ marginBottom: 16, flexShrink: 0 }}
        />
      )}

      {/* 终端界面 */}
      <Card 
        style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column',
          padding: 0,
        }}
        styles={{ 
          body: {
            flex: 1, 
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
          }
        }}
      >
        <div
          ref={terminalRef}
          style={{
            flex: 1,
            minHeight: '400px',
            width: '100%',
          }}
        />
      </Card>
    </div>
  );
};

export default PodTerminal;