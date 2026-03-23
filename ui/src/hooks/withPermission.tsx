/**
 * 权限检查高阶组件
 * 用于包装需要权限检查的组件
 */

import React from 'react';
import { Result } from 'antd';
import { usePermission } from './usePermission';

export const withPermission = <P extends object>(
  WrappedComponent: React.ComponentType<P>,
  requiredAction?: string
) => {
  return (props: P) => {
    const { canPerformAction } = usePermission();
    
    if (requiredAction && !canPerformAction(requiredAction)) {
      return <Result status="403" title="无权限" subTitle="您没有权限访问此内容" />;
    }
    
    return <WrappedComponent {...props} />;
  };
};

