import React, { useEffect, useRef, useState } from 'react';
import { Card, Button, Space, message, Alert } from 'antd';
import { useTranslation } from 'react-i18next';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { ClipboardAddon } from '@xterm/addon-clipboard';
import 'xterm/css/xterm.css';
import {
  PlayCircleOutlined,
  StopOutlined,
  ClearOutlined,
  FullscreenOutlined,
} from '@ant-design/icons';
import { buildWebSocketUrl } from '../utils/wsUrl';

interface KubectlTerminalProps {
  clusterId: string;
  namespace?: string;
}

const KubectlTerminal: React.FC<KubectlTerminalProps> = ({
  clusterId,
}) => {
  const { t } = useTranslation('components');
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const websocket = useRef<WebSocket | null>(null);
  
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  // selectedNamespace 用于接收 WebSocket 消息中的命名空间变更，当前未在 UI 中显示
  const [, setSelectedNamespace] = useState<string>('default');
  
  // 使用 ref 来保存连接状态，避免闭包问题
  const connectedRef = useRef(false);
  const currentLineRef = useRef('');

  // 初始化终端
  useEffect(() => {
    const initTerminal = () => {
      if (terminalRef.current && !terminal.current) {
        try {
          terminal.current = new Terminal({
            cursorBlink: true,
            fontSize: 14,
            fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
            theme: {
              background: '#1e1e1e',
              foreground: '#d4d4d4',
              cursor: '#ffffff',
              selectionBackground: '#264f78',
            },
            cols: 80,
            rows: 24,
            allowTransparency: true,
            rightClickSelectsWord: true,
          });

          // 添加插件
          fitAddon.current = new FitAddon();
          terminal.current.loadAddon(fitAddon.current);
          terminal.current.loadAddon(new WebLinksAddon());
          
          // 添加剪贴板支持
          const clipboardAddon = new ClipboardAddon();
          terminal.current.loadAddon(clipboardAddon);

          terminal.current.open(terminalRef.current);
          
          // 等待 DOM 完全渲染后再 fit
          requestAnimationFrame(() => {
            setTimeout(() => {
              if (fitAddon.current && terminal.current && terminalRef.current) {
                try {
                  fitAddon.current.fit();
                } catch (e) {
                  console.warn('Fit addon error:', e);
                }
              }
            }, 300);
          });

          // 显示欢迎信息
          setTimeout(() => {
            showWelcomeMessage();
          }, 500);

          // 设置终端输入处理
          terminal.current.onData((data) => {
            handleTerminalInput(data);
          });

          // 添加键盘快捷键支持
          terminal.current.attachCustomKeyEventHandler((event) => {
            if (event.type === 'keydown') {
              if (event.ctrlKey && event.key === 'c' && terminal.current?.hasSelection()) {
                const selection = terminal.current.getSelection();
                if (selection) {
                  navigator.clipboard.writeText(selection);
                }
                return false;
              }
              
              if (event.ctrlKey && event.key === 'v') {
                pasteFromClipboard();
                return false;
              }
            }
            return true;
          });

          // 监听窗口大小变化
          const handleResize = () => {
            if (fitAddon.current && terminal.current && terminalRef.current) {
              requestAnimationFrame(() => {
                setTimeout(() => {
                  try {
                    fitAddon.current?.fit();
                  } catch (e) {
                    console.warn('Resize fit error:', e);
                  }
                }, 100);
              });
            }
          };
          window.addEventListener('resize', handleResize);

          return () => {
            window.removeEventListener('resize', handleResize);
            if (terminal.current) {
              terminal.current.dispose();
              terminal.current = null;
            }
          };
        } catch (error) {
          console.error('Failed to initialize terminal:', error);
        }
      }
    };

    const timer = setTimeout(initTerminal, 100);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 显示欢迎信息
  const showWelcomeMessage = () => {
    if (!terminal.current) return;
    
    terminal.current.clear();
    terminal.current.writeln(t('kubectlTerminal.welcomeLine1'));
    terminal.current.writeln(t('kubectlTerminal.welcomeLine2'));
    terminal.current.writeln(t('kubectlTerminal.welcomeLine3'));
    terminal.current.writeln('');
  };

  // 连接到后端 WebSocket
  const connectWebSocket = () => {
    const token = localStorage.getItem('token');
    if (!token) {
      message.error(t('kubectlTerminal.notLoggedIn'));
      return;
    }
    
    setConnecting(true);
    terminal.current?.clear();
    terminal.current?.write(`\x1b[33m${t('kubectlTerminal.preparing')}\x1b[0m`);
    
    const wsUrl = buildWebSocketUrl(`/ws/clusters/${clusterId}/kubectl`);
    const params = new URLSearchParams({
      token: token,
    });

    console.log('Connecting to WebSocket:', `${wsUrl}?${params}`);

    try {
      websocket.current = new WebSocket(`${wsUrl}?${params}`);

      websocket.current.onopen = () => {
        // 等待服务端 type=connected（Pod/shell 就绪）
      };

      websocket.current.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WebSocketMessage;
          if (msg.type === 'connected') {
            setConnected(true);
            connectedRef.current = true;
            setConnecting(false);
            terminal.current?.clear();
            message.success(t('kubectlTerminal.connectSuccess'));
            if (fitAddon.current && terminal.current) {
              const dimensions = fitAddon.current.proposeDimensions();
              if (dimensions && websocket.current?.readyState === WebSocket.OPEN) {
                websocket.current.send(JSON.stringify({
                  type: 'resize',
                  cols: dimensions.cols,
                  rows: dimensions.rows,
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

      websocket.current.onerror = () => {
        console.error('WebSocket error');
        message.error(t('kubectlTerminal.connectError'));
        setConnected(false);
        connectedRef.current = false;
        setConnecting(false);
      };

      websocket.current.onclose = () => {
        setConnected(false);
        connectedRef.current = false;
        setConnecting(false);
        terminal.current?.writeln('\r\n\x1b[33mConnection closed\x1b[0m\r\n');
      };

    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      message.error(t('kubectlTerminal.createFailed'));
      setConnecting(false);
    }
  };

  // 终端输入处理
  const [, setCurrentLine] = useState('');
  const [, setCommandHistory] = useState<string[]>([]);

  const handleTerminalInput = (data: string) => {
    if (!terminal.current) return;
    
    if (!connectedRef.current) {
      terminal.current.write('\r\nPlease connect first\r\n');
      return;
    }

    if (!websocket.current || websocket.current.readyState !== WebSocket.OPEN) {
      terminal.current.write('\r\nConnection lost. Please reconnect.\r\n');
      return;
    }

    const code = data.charCodeAt(0);
    
    if (code === 13) {
      terminal.current.write('\r\n');
      
      websocket.current.send(JSON.stringify({
        type: 'command',
        data: currentLineRef.current.trim(),
      }));
      
      if (currentLineRef.current.trim()) {
        setCommandHistory(prev => [...prev, currentLineRef.current.trim()]);
      }
      
      currentLineRef.current = '';
      setCurrentLine('');
      return;
    }
    
    if (code === 127) {
      if (currentLineRef.current.length > 0) {
        currentLineRef.current = currentLineRef.current.slice(0, -1);
        setCurrentLine(currentLineRef.current);
        
        websocket.current.send(JSON.stringify({
          type: 'input',
          data: '\u007f',
        }));
      }
      return;
    }
    
    if (code === 3) {
      if (websocket.current && websocket.current.readyState === WebSocket.OPEN) {
        websocket.current.send(JSON.stringify({
          type: 'interrupt',
          data: '',
        }));
        terminal.current.write('^C\r\n');
        currentLineRef.current = '';
        setCurrentLine('');
      }
      return;
    }
    
    if (code === 27) {
      return;
    }
    
    if (code >= 32 && code <= 126) {
      currentLineRef.current += data;
      setCurrentLine(currentLineRef.current);
      
      websocket.current.send(JSON.stringify({
        type: 'input',
        data: data,
      }));
    }
  };

  // 处理 WebSocket 消息
  interface WebSocketMessage {
    type: string;
    data: string;
  }

  const handleWebSocketMessage = (message: WebSocketMessage) => {
    if (!terminal.current) return;

    switch (message.type) {
      case 'data':
        terminal.current.write(message.data);
        break;
      case 'output': {
        const outputText = message.data;
        if (outputText.includes('\n')) {
          const lines = outputText.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (i < lines.length - 1 || outputText.endsWith('\n')) {
              terminal.current.writeln(lines[i]);
            } else {
              terminal.current.write(lines[i]);
            }
          }
        } else {
          terminal.current.write(outputText);
        }
        break;
      }
      case 'error':
        setConnecting(false);
        terminal.current.writeln(`\r\n\x1b[31m${message.data}\x1b[0m`);
        break;
      case 'command_result':
        terminal.current.write('$ ');
        break;
      case 'clear':
        terminal.current.clear();
        break;
      case 'namespace_changed':
        setSelectedNamespace(message.data);
        terminal.current.writeln(`\r\nNamespace changed to: ${message.data}\r\n`);
        break;
      default:
        console.log('Unknown message type:', message.type);
    }
  };


  // 断开连接
  const disconnect = () => {
    if (websocket.current) {
      websocket.current.close();
    }
    setConnected(false);
    connectedRef.current = false;
    currentLineRef.current = '';
    setCurrentLine('');
    terminal.current?.clear();
    showWelcomeMessage();
  };

  // 清屏
  const clearTerminal = () => {
    terminal.current?.clear();
  };

  // 全屏切换
  const toggleFullscreen = () => {
    const terminalContainer = terminalRef.current?.parentElement;
    if (terminalContainer) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        terminalContainer.requestFullscreen();
      }
    }
  };

  useEffect(() => {
    showWelcomeMessage();
  }, []);

  // 粘贴剪贴板内容
  const pasteFromClipboard = () => {
    if (!connected) {
      message.error(t('kubectlTerminal.connectFirst'));
      return;
    }
    
    navigator.clipboard.readText()
      .then((text) => {
        if (text && websocket.current && websocket.current.readyState === WebSocket.OPEN) {
          websocket.current.send(JSON.stringify({
            type: 'quick_command',
            data: text
          }));
          
          currentLineRef.current = '';
          setCurrentLine('');
        }
      })
      .catch((err) => {
        console.error('Paste failed:', err);
        message.error(t('kubectlTerminal.pasteFailed'));
      });
  };

  return (
    <Card
      title={t('kubectlTerminal.title')}
      extra={
        <Space>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={connectWebSocket}
            loading={connecting}
            disabled={connected}
          >
            {t('kubectlTerminal.connect')}
          </Button>
          <Button
            icon={<StopOutlined />}
            onClick={disconnect}
            disabled={!connected}
          >
            {t('kubectlTerminal.disconnect')}
          </Button>
          <Button icon={<ClearOutlined />} onClick={clearTerminal}>
            {t('kubectlTerminal.clear')}
          </Button>
          <Button icon={<FullscreenOutlined />} onClick={toggleFullscreen}>
            {t('kubectlTerminal.fullscreen')}
          </Button>
        </Space>
      }
    >

      {/* 连接状态提示 */}
      {connected && (
        <Alert
          message={t('kubectlTerminal.connectedToCluster', { clusterId })}
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {/* 终端容器 */}
      <div
        ref={terminalRef}
        style={{
          height: '400px',
          border: '1px solid #d9d9d9',
          borderRadius: '6px',
          backgroundColor: '#1e1e1e',
        }}
      />

      {/* 使用说明 */}
      <div style={{ marginTop: 16, fontSize: '12px', color: '#666' }}>
        <p dangerouslySetInnerHTML={{ __html: t('kubectlTerminal.helpHint') }} />
      </div>
    </Card>
  );
};

export default KubectlTerminal;
