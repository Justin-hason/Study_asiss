import { useEffect, useState } from 'react';
import { Tree, Spin, Empty } from 'antd';
import type { TreeProps } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { FolderOutlined } from '@ant-design/icons';
import request from '../../api/request';

interface Folder {
  id: string;
  tenant_id: string;
  parent_id?: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  children?: Folder[];
}

function transformToTreeData(folders: Folder[]): DataNode[] {
  return folders.map((folder) => ({
    key: folder.id,
    title: folder.name,
    icon: <FolderOutlined />,
    children: folder.children ? transformToTreeData(folder.children) : undefined,
  }));
}

interface FolderTreeProps {
  onSelect: (folderId: string | undefined) => void;
}

export default function FolderTree({ onSelect }: FolderTreeProps) {
  const [treeData, setTreeData] = useState<DataNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    request
      .get('/knowledge/folders/tree')
      .then((data: any) => {
        setTreeData(transformToTreeData(data as Folder[]));
      })
      .catch(() => {
        setTreeData([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleSelect: TreeProps['onSelect'] = (selectedKeys) => {
    onSelect(selectedKeys.length > 0 ? (selectedKeys[0] as string) : undefined);
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 24 }}>
        <Spin />
      </div>
    );
  }

  if (treeData.length === 0) {
    return <Empty description="暂无文件夹" />;
  }

  return (
    <Tree
      treeData={treeData}
      onSelect={handleSelect}
      showIcon
      defaultExpandAll={false}
    />
  );
}
