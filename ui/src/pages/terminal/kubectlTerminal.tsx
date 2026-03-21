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
import { namespaceService } from '../../services/namespaceService';
import { buildWebSocketUrl } from '../../utils/wsUrl';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;
const { Option } = Select;

const KubectlTerminalPage: React.FC = () => {
const { t } = useTranslation(["terminal", "common"]);
const { id: clusterId } = useParams<{ id: string }>();
  
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const websocket = useRef<WebSocket | null>(null);
  
  const [selectedNamespace, setSelectedNamespace] = useState<string>('default');
  const [namespaces, setNamespaces] = useState<string[]>(['default', 'kube-system', 'kube-public']);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  
  const connectedRef = useRef(false);
  const currentLineRef = useRef('');

  // 加载命名空间列表
  useEffect(() => {
    const fetchNamespaces = async () => {
      if (!clusterId) return;
      
      try {
        const response = await namespaceService.getNamespaces(clusterId);
        if (response.code === 200 && response.data) {
          const names = response.data.map((ns) => ns.name).filter(Boolean);
          if (names.length > 0) {
            setNamespaces(names);
            // 如果当前选中的命名空间不在新列表中，则切换到第一个
            setSelectedNamespace((prev) => {
              if (!names.includes(prev)) {
                return names[0];
              }
              return prev;
            });
          }
        }
      } catch (error) {
        console.error('获取命名空间列表失败:', error);
        // 保持默认值，不显示错误提示，避免影响用户体验
      }
    };

    fetchNamespaces();
  }, [clusterId]);

  // 处理终端输入 - 直接发送所有输入到服务端（Pod Terminal 模式）
  const handleTerminalInput = useCallback((data: string) => {
    if (!connectedRef.current || !websocket.current) return;

    if (websocket.current.readyState !== WebSocket.OPEN) {
      terminal.current?.write('\r\nConnection lost. Please reconnect.\r\n');
      return;
    }

    // 直接发送所有输入到服务端，由服务端处理并回显
    websocket.current.send(JSON.stringify({
      type: 'input',
      data: data,
    }));
  }, []);

  // 粘贴剪贴板内容
  const pasteFromClipboard = useCallback(() => {
    if (!connectedRef.current) {
      message.error(t('messages.connectFirst'));
      return;
    }
    
    navigator.clipboard.readText()
      .then((text) => {
        if (text && websocket.current && websocket.current.readyState === WebSocket.OPEN) {
          // 直接作为输入发送
          websocket.current.send(JSON.stringify({
            type: 'input',
            data: text
          }));
        }
      })
      .catch((err) => {
        console.error('粘贴失败:', err);
        message.error(t('messages.pasteFailed'));
      });
  }, []);

  // 显示欢迎信息
  const showWelcomeMessage = useCallback(() => {
    if (!terminal.current) return;
    
    terminal.current.clear();
    terminal.current.writeln('\x1b[32m╭─────────────────────────────────────────────────────────────╮\x1b[0m');
    terminal.current.writeln('\x1b[32m│                  KubePolaris Kubectl Terminal               │\x1b[0m');
    terminal.current.writeln('\x1b[32m╰─────────────────────────────────────────────────────────────╯\x1b[0m');
    terminal.current.writeln('');
    terminal.current.writeln(`\x1b[36mCluster:\x1b[0m ${clusterId}`);
    terminal.current.writeln(`\x1b[36mNamespace:\x1b[0m ${selectedNamespace}`);
    terminal.current.writeln('');
    terminal.current.writeln('\x1b[33m' + t('kubectl.welcomeMessage') + '\x1b[0m');
    terminal.current.writeln('');
  }, [clusterId, selectedNamespace]);

  // 初始化终端
  useEffect(() => {
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
                const rect = terminalRef.current.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                  fitAddon.current.fit();
                } else {
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

          // 添加键盘快捷键支持
          terminal.current.attachCustomKeyEventHandler((event) => {
            if (event.type === 'keydown') {
              // Ctrl+C 复制
              if (event.ctrlKey && event.key === 'c' && terminal.current?.hasSelection()) {
                const selection = terminal.current.getSelection();
                if (selection) {
                  navigator.clipboard.writeText(selection);
                }
                return false;
              }
              
              // Ctrl+V 粘贴
              if (event.ctrlKey && event.key === 'v') {
                pasteFromClipboard();
                return false;
              }
            }
            return true;
          });

        } catch (error) {
          console.error('初始化终端失败:', error);
          message.error(t('messages.initFailed'));
        }
      }
    };

    const timer = setTimeout(initTerminal, 100);

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
  }, [showWelcomeMessage, handleTerminalInput, pasteFromClipboard]);

  // 处理 WebSocket 消息
  interface WebSocketMessage {
    type: string;
    data: string;
  }

  const handleWebSocketMessage = (msg: WebSocketMessage) => {
    if (!terminal.current) return;

    switch (msg.type) {
      case 'data':
        // Pod Terminal 模式：直接写入终端输出
        terminal.current.write(msg.data);
        break;
      case 'output':
        // 旧模式兼容
        terminal.current.write(msg.data);
        break;
      case 'kubectl_prep':
        // 由 onmessage 统一单行刷新，此处兜底
        terminal.current.write(`\r\x1b[2K\x1b[33m${msg.data}\x1b[0m`);
        break;
      case 'connected':
        // Pod 连接成功（主流程在 onmessage 里处理 UI 状态）
        console.log('Pod terminal connected:', msg.data);
        break;
      case 'disconnected':
        terminal.current.writeln(`\r\n\x1b[33m${msg.data}\x1b[0m`);
        break;
      case 'error':
        setConnecting(false);
        terminal.current.writeln(`\r\n\x1b[31m${msg.data}\x1b[0m`);
        break;
      case 'command_result':
        // 旧模式兼容
        break;
      case 'clear':
        terminal.current.clear();
        break;
      default:
        break;
    }
  };

  // 连接终端
  const connectTerminal = () => {
    if (!clusterId) {
      message.error(t('messages.missingClusterId'));
      return;
    }
    
    // 获取认证 token
    const token = localStorage.getItem('token');
    if (!token) {
      message.error(t('messages.notLoggedIn'));
      return;
    }
    
    setConnecting(true);
    
    if (terminal.current) {
      terminal.current.clear();
      // 不换行，便于后续 kubectl_prep 用 \r 刷新同一行进度
      terminal.current.write('\x1b[33m' + t('kubectl.connecting') + '\x1b[0m');
    }
    
    const wsUrl = buildWebSocketUrl(
      `/ws/clusters/${clusterId}/kubectl?token=${encodeURIComponent(token)}&namespace=${encodeURIComponent(selectedNamespace)}`
    );
    
    try {
      const ws = new WebSocket(wsUrl);
      websocket.current = ws;
      
      ws.onopen = () => {
        // WebSocket 已建立；kubectl Pod 可能仍在创建/拉取镜像，等服务端 type=connected 再视为可交互
      };
      
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WebSocketMessage;
          if (msg.type === 'connected') {
            setConnected(true);
            setConnecting(false);
            connectedRef.current = true;
            message.success(t('messages.connectSuccess'));
            if (terminal.current) {
              terminal.current.clear();
            }
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
            return;
          }
          if (msg.type === 'kubectl_prep' && terminal.current) {
            terminal.current.write(`\r\x1b[2K\x1b[33m${msg.data}\x1b[0m`);
            return;
          }
          handleWebSocketMessage(msg);
        } catch {
          terminal.current?.write(event.data);
        }
      };
      
      ws.onerror = (_error) => {
        console.error('WebSocket错误:', _error);
        message.error(t('messages.connectError'));
        setConnected(false);
        setConnecting(false);
        connectedRef.current = false;
        
        if (terminal.current) {
          terminal.current.writeln('\x1b[31m' + t('messages.connectionError') + '\x1b[0m');
        }
      };
      
      ws.onclose = () => {
        setConnected(false);
        setConnecting(false);
        connectedRef.current = false;
        message.info(t('messages.connectionLost'));
        
        if (terminal.current) {
          terminal.current.writeln('\x1b[31m\r\n' + t('messages.connectionClosed') + '\x1b[0m');
        }
      };
      
    } catch (error) {
      console.error('创建WebSocket连接失败:', error);
      message.error(t('messages.createFailed'));
      setConnecting(false);
      
      if (terminal.current) {
        terminal.current.writeln('\x1b[31m' + t('messages.createConnectionFailed') + '\x1b[0m');
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
    currentLineRef.current = '';
    
    if (terminal.current) {
      terminal.current.writeln('\x1b[33m\r\n' + t('messages.disconnected') + '\x1b[0m');
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

  // 命名空间变更
  const handleNamespaceChange = (value: string) => {
    setSelectedNamespace(value);
    
    if (connected && websocket.current && websocket.current.readyState === WebSocket.OPEN) {
      websocket.current.send(JSON.stringify({
        type: 'change_namespace',
        data: value
      }));
    }
  };

  // 窗口大小变化时重新调整终端大小
  useEffect(() => {
    const handleResize = () => {
      if (fitAddon.current && terminal.current) {
        setTimeout(() => {
          try {
            fitAddon.current?.fit();
            // 发送新的终端尺寸到服务端
            if (websocket.current && websocket.current.readyState === WebSocket.OPEN) {
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
  }, []);

  if (!clusterId) {
    return <div>{t('messages.clusterNotFound')}</div>;
  }

  return (
    <div style={{ padding: '24px', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* 页面头部 */}
      <div style={{ marginBottom: 16, flexShrink: 0 }}>
        <Space>
          <Title level={3} style={{ margin: 0 }}>
            {t('kubectl.title')}
          </Title>
          <Text type="secondary">
            {t('kubectl.cluster')}: {clusterId}
          </Text>
        </Space>
        
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col span={4}>
            <Select
              placeholder={t("kubectl.selectNamespace")}
              value={selectedNamespace}
              onChange={handleNamespaceChange}
              style={{ width: '100%' }}
            >
              {namespaces.map(ns => (
                <Option key={ns} value={ns}>
                  {ns}
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
                >
                  {t('kubectl.connect')}
                </Button>
              ) : (
                <Button
                  danger
                  icon={<StopOutlined />}
                  onClick={disconnectTerminal}
                >
                  {t('kubectl.disconnect')}
                </Button>
              )}
              
              <Button
                icon={<ClearOutlined />}
                onClick={clearTerminal}
              >
                {t('kubectl.clear')}
              </Button>
              
              <Button
                icon={<FullscreenOutlined />}
                onClick={toggleFullscreen}
              >
                {t('kubectl.fullscreen')}
              </Button>
            </Space>
          </Col>
        </Row>
      </div>

      {/* 连接状态提示 */}
      {connecting && !connected && (
        <Alert
          message={t('kubectl.prepHint')}
          type="info"
          showIcon
          style={{ marginBottom: 16, flexShrink: 0 }}
        />
      )}
      {connected && (
        <Alert
          message={t('kubectl.connectedTo', { clusterId, namespace: selectedNamespace })}
          type="success"
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

export default KubectlTerminalPage;
