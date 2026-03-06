import React from 'react';
import { Dropdown, Button } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { MenuProps } from 'antd';
import { supportedLanguages } from '../i18n';

const LanguageSwitcher: React.FC = () => {
  const { i18n } = useTranslation();

  const handleLanguageChange: MenuProps['onClick'] = ({ key }) => {
    i18n.changeLanguage(key);
  };

  const currentLanguage = supportedLanguages.find(lang => lang.code === i18n.language) 
    || supportedLanguages[0];

  const menuItems: MenuProps['items'] = supportedLanguages.map(lang => ({
    key: lang.code,
    label: (
      <span>
        {lang.flag} {lang.name}
      </span>
    ),
  }));

  return (
    <Dropdown 
      menu={{ 
        items: menuItems, 
        onClick: handleLanguageChange,
        selectedKeys: [i18n.language],
      }} 
      placement="bottomRight"
    >
      <Button 
        type="text" 
        icon={<GlobalOutlined />}
        style={{ color: '#ffffff' }}
      >
        {currentLanguage.flag}
      </Button>
    </Dropdown>
  );
};

export default React.memo(LanguageSwitcher);
