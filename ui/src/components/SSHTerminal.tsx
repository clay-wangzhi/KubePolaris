import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { Card, Button, Space, Input, Modal, Form, message, Select, Spin } from 'antd';
import { useTranslation } from 'react-i18next';
import { 
  ReloadOutlined, 
  DisconnectOutlined,
  LinkOutlined
} from '@ant-design/icons';
import { systemSettingService } from '../services/authService';
import { buildWebSocketUrl } from '../utils/wsUrl';
import 'xterm/css/xterm.css';

interface SSHTerminalProps {
  nodeIP?: string;
  nodeName?: string;
  clusterId?: string;
}

interface SSHConnection {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  authType: 'password' | 'key';
  clusterId?: number;
}

const SSHTerminal: React.FC<SSHTerminalProps> = ({ nodeIP, clusterId }) => {
  const { t } = useTranslation('components');
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const websocket = useRef<WebSocket | null>(null);
  
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionModalVisible, setConnectionModalVisible] = useState(false);
  const [form] = Form.useForm();

  // 初始化终端
  const initTerminal = () => {
    if (!terminalRef.current) return;

    terminal.current = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#ffffff',
        selectionBackground: '#264f78',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#e5e5e5'
      },
      cols: 80,
      rows: 24,
    });

    fitAddon.current = new FitAddon();
    terminal.current.loadAddon(fitAddon.current);
    terminal.current.loadAddon(new WebLinksAddon());

    terminal.current.open(terminalRef.current);
    fitAddon.current.fit();

    terminal.current.writeln(`\x1b[1;32m${t('sshTerminal.welcome')}\x1b[0m`);
    terminal.current.writeln(`\x1b[1;33m${t('sshTerminal.clickConnect')}\x1b[0m`);
    terminal.current.writeln('');

    terminal.current.onData((data) => {
      if (websocket.current && websocket.current.readyState === WebSocket.OPEN) {
        websocket.current.send(JSON.stringify({
          type: 'input',
          data: data
        }));
      }
    });

    const handleResize = () => {
      if (fitAddon.current) {
        fitAddon.current.fit();
        if (websocket.current && websocket.current.readyState === WebSocket.OPEN) {
          const { cols, rows } = terminal.current!;
          websocket.current.send(JSON.stringify({
            type: 'resize',
            cols,
            rows
          }));
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  };

  // 连接SSH
  const connectSSH = async (connection: SSHConnection) => {
    if (!terminal.current) return;

    const token = localStorage.getItem('token');
    if (!token) {
      message.error(t('sshTerminal.notLoggedIn'));
      return;
    }

    setIsConnecting(true);
    terminal.current.clear();
    terminal.current.writeln(`\x1b[1;33m${t('sshTerminal.connecting')}\x1b[0m`);

    try {
      const wsUrl = buildWebSocketUrl(`/ws/ssh/terminal?token=${encodeURIComponent(token)}`);
      
      websocket.current = new WebSocket(wsUrl);

      websocket.current.onopen = () => {
        websocket.current!.send(JSON.stringify({
          type: 'connect',
          config: connection
        }));
      };

      websocket.current.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        
        switch (msg.type) {
          case 'connected':
            setIsConnected(true);
            setIsConnecting(false);
            terminal.current!.clear();
            terminal.current!.writeln(`\x1b[1;32m✓ ${t('sshTerminal.connectSuccess')}\x1b[0m`);
            terminal.current!.writeln(`\x1b[1;36m${t('sshTerminal.connectedTo')}: ${connection.username}@${connection.host}:${connection.port}\x1b[0m`);
            terminal.current!.writeln('');
            message.success(t('sshTerminal.connectSuccess'));
            break;
            
          case 'data':
            terminal.current!.write(msg.data);
            break;
            
          case 'error':
            setIsConnecting(false);
            setIsConnected(false);
            terminal.current!.writeln(`\x1b[1;31m✗ ${t('sshTerminal.connectFailed')}: ${msg.error}\x1b[0m`);
            message.error(`${t('sshTerminal.connectFailed')}: ${msg.error}`);
            break;
            
          case 'disconnected':
            setIsConnected(false);
            terminal.current!.writeln(`\x1b[1;33m${t('sshTerminal.disconnected')}\x1b[0m`);
            break;
        }
      };

      websocket.current.onerror = () => {
        setIsConnecting(false);
        setIsConnected(false);
        terminal.current!.writeln(`\x1b[1;31m✗ ${t('sshTerminal.wsFailed')}\x1b[0m`);
        message.error(t('sshTerminal.wsFailed'));
      };

      websocket.current.onclose = () => {
        setIsConnected(false);
        setIsConnecting(false);
        terminal.current!.writeln(`\x1b[1;33m${t('sshTerminal.connectionClosed')}\x1b[0m`);
      };

    } catch (error) {
      setIsConnecting(false);
      terminal.current.writeln(`\x1b[1;31m✗ ${t('sshTerminal.connectFailed')}: ${error}\x1b[0m`);
      message.error(t('sshTerminal.connectFailed'));
    }
  };

  // 断开连接
  const disconnect = () => {
    if (websocket.current) {
      websocket.current.close();
      websocket.current = null;
    }
    setIsConnected(false);
    if (terminal.current) {
      terminal.current.writeln(`\x1b[1;33m${t('sshTerminal.disconnected')}\x1b[0m`);
    }
  };

  // 清空终端
  const clearTerminal = () => {
    if (terminal.current) {
      terminal.current.clear();
    }
  };

  // 点击连接按钮
  const handleConnectClick = async () => {
    if (!nodeIP) {
      message.error(t('sshTerminal.nodeIPUnknown'));
      return;
    }

    setIsConnecting(true);
    terminal.current?.clear();
    terminal.current?.writeln(`\x1b[1;36m${t('sshTerminal.checkingGlobalConfig')}\x1b[0m`);

    try {
      const response = await systemSettingService.getSSHCredentials();
      
      if (response?.enabled) {
        const sshConfig = response;
        
        terminal.current?.writeln(`\x1b[1;32m✓ ${t('sshTerminal.globalConfigEnabled')}\x1b[0m`);
        
        const connection: SSHConnection = {
          host: nodeIP,
          port: sshConfig.port || 22,
          username: sshConfig.username || 'root',
          authType: sshConfig.auth_type as 'password' | 'key',
          password: sshConfig.auth_type === 'password' ? sshConfig.password : undefined,
          privateKey: sshConfig.auth_type === 'key' ? sshConfig.private_key : undefined,
          clusterId: clusterId ? parseInt(clusterId, 10) : undefined,
        };
        
        await connectSSH(connection);
      } else {
        setIsConnecting(false);
        terminal.current?.writeln(`\x1b[1;33m${t('sshTerminal.globalConfigDisabled')}\x1b[0m`);
        terminal.current?.writeln('');
        setConnectionModalVisible(true);
      }
    } catch (error) {
      console.error('Failed to get SSH config:', error);
      setIsConnecting(false);
      terminal.current?.writeln(`\x1b[1;33m${t('sshTerminal.globalConfigFailed')}\x1b[0m`);
      terminal.current?.writeln('');
      setConnectionModalVisible(true);
    }
  };

  // 处理手动连接表单提交
  const handleManualConnect = async (values: Record<string, unknown>) => {
    const connection: SSHConnection = {
      host: (values.host as string) || nodeIP || '',
      port: (values.port as number) || 22,
      username: values.username as string,
      authType: values.authType as 'password' | 'key',
      password: values.authType === 'password' ? (values.password as string) : undefined,
      privateKey: values.authType === 'key' ? (values.privateKey as string) : undefined,
      clusterId: clusterId ? parseInt(clusterId, 10) : undefined,
    };

    await connectSSH(connection);
    setConnectionModalVisible(false);
    form.resetFields();
  };

  // 组件挂载时初始化终端
  useEffect(() => {
    const cleanup = initTerminal();
    return () => {
      if (cleanup) cleanup();
      if (websocket.current) {
        websocket.current.close();
      }
      if (terminal.current) {
        terminal.current.dispose();
      }
    };
  }, []);

  // 设置默认连接信息
  useEffect(() => {
    if (nodeIP) {
      form.setFieldsValue({
        host: nodeIP,
        port: 22,
        username: 'root',
        authType: 'password'
      });
    }
  }, [nodeIP, form]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 工具栏 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space>
          <Button
            type="primary"
            icon={<LinkOutlined />}
            onClick={handleConnectClick}
            disabled={isConnecting}
          >
            {isConnected ? t('sshTerminal.reconnect') : t('sshTerminal.connect')}
          </Button>
          
          <Button
            icon={<DisconnectOutlined />}
            onClick={disconnect}
            disabled={!isConnected}
            danger
          >
            {t('sshTerminal.disconnectBtn')}
          </Button>
          
          <Button
            icon={<ReloadOutlined />}
            onClick={clearTerminal}
          >
            {t('sshTerminal.clearBtn')}
          </Button>

          {isConnecting && (
            <Space>
              <Spin size="small" />
              <span>{t('sshTerminal.connectingStatus')}</span>
            </Space>
          )}

          {isConnected && (
            <span style={{ color: '#52c41a' }}>
              ✓ {t('sshTerminal.connectedToNode', { ip: nodeIP })}
            </span>
          )}
        </Space>
      </Card>

      {/* 终端容器 */}
      <Card 
        style={{ 
          flex: 1, 
          padding: 0,
          backgroundColor: '#1e1e1e'
        }}
        styles={{
          body: { 
            padding: 8, 
            height: '100%',
            backgroundColor: '#1e1e1e'
          }
        }}
      >
        <div
          ref={terminalRef}
          style={{ 
            height: '500px',
            width: '100%'
          }}
        />
      </Card>

      {/* SSH连接配置模态框 */}
      <Modal
        title={t('sshTerminal.sshConfig')}
        open={connectionModalVisible}
        onCancel={() => setConnectionModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleManualConnect}
          initialValues={{
            host: nodeIP,
            port: 22,
            username: 'root',
            authType: 'password'
          }}
        >
          <Form.Item
            label={t('sshTerminal.host')}
            name="host"
            rules={[{ required: true, message: t('sshTerminal.hostRequired') }]}
          >
            <Input placeholder={t('sshTerminal.hostPlaceholder')} />
          </Form.Item>

          <Form.Item
            label={t('sshTerminal.port')}
            name="port"
            rules={[{ required: true, message: t('sshTerminal.portRequired') }]}
          >
            <Input type="number" placeholder="22" />
          </Form.Item>

          <Form.Item
            label={t('sshTerminal.username')}
            name="username"
            rules={[{ required: true, message: t('sshTerminal.usernameRequired') }]}
          >
            <Input placeholder={t('sshTerminal.usernamePlaceholder')} />
          </Form.Item>

          <Form.Item
            label={t('sshTerminal.authType')}
            name="authType"
            rules={[{ required: true, message: t('sshTerminal.authTypeRequired') }]}
          >
            <Select>
              <Select.Option value="password">{t('sshTerminal.passwordAuth')}</Select.Option>
              <Select.Option value="key">{t('sshTerminal.keyAuth')}</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) =>
              prevValues.authType !== currentValues.authType
            }
          >
            {({ getFieldValue }) => {
              const authType = getFieldValue('authType');
              
              if (authType === 'password') {
                return (
                  <Form.Item
                    label={t('sshTerminal.password')}
                    name="password"
                    rules={[{ required: true, message: t('sshTerminal.passwordRequired') }]}
                  >
                    <Input.Password placeholder={t('sshTerminal.passwordPlaceholder')} />
                  </Form.Item>
                );
              }
              
              if (authType === 'key') {
                return (
                  <Form.Item
                    label={t('sshTerminal.privateKey')}
                    name="privateKey"
                    rules={[{ required: true, message: t('sshTerminal.privateKeyRequired') }]}
                  >
                    <Input.TextArea
                      rows={6}
                      placeholder={t('sshTerminal.privateKeyPlaceholder')}
                    />
                  </Form.Item>
                );
              }
              
              return null;
            }}
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setConnectionModalVisible(false)}>
                {t('sshTerminal.cancel')}
              </Button>
              <Button type="primary" htmlType="submit" loading={isConnecting}>
                {t('sshTerminal.connect')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default SSHTerminal;
