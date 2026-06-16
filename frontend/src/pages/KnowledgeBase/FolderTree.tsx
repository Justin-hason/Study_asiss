import { useEffect, useState } from 'react';
import { Tree } from 'antd';
import type { TreeProps } from 'antd';
import { getFolderTree, type FolderNode } from '../../api/knowledge';

interface FolderTreeProps {
  selectedFolderId?: string;
  onSelect?: (folderId: string | undefined) => void;
}

function convertToTreeData(folders: FolderNode[]): TreeProps['treeData'] {
  return folders.map((folder) => ({
    title: folder.name,
    key: folder.id,
    children: folder.children ? convertToTreeData(folder.children) : undefined,
  }));
}

const ROOT_KEY = '__root__';

export default function FolderTree({ selectedFolderId, onSelect }: FolderTreeProps) {
  const [treeData, setTreeData] = useState<TreeProps['treeData']>([]);
  const [loading, setLoading] = useState(true);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  useEffect(() => {
    setLoading(true);
    getFolderTree()
      .then((data: FolderNode[]) => {
        const rootNode = {
          title: '全部文档',
          key: ROOT_KEY,
          children: convertToTreeData(data),
        };
        setTreeData([rootNode]);
        setExpandedKeys([ROOT_KEY]);
      })
      .catch(() => {
        setTreeData([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const selectedKeys = selectedFolderId ? [selectedFolderId] : [ROOT_KEY];

  const handleSelect: TreeProps['onSelect'] = (_selectedKeys, info) => {
    const key = info.node.key as string;
    if (key === ROOT_KEY) {
      onSelect?.(undefined);
    } else {
      onSelect?.(key);
    }
  };

  const handleExpand: TreeProps['onExpand'] = (keys) => {
    setExpandedKeys(keys as string[]);
  };

  if (loading) {
    return <div style={{ padding: 16 }}>加载中...</div>;
  }

  if (!treeData?.length) {
    return <div style={{ padding: 16, color: '#999' }}>暂无文件夹</div>;
  }

  return (
    <Tree
      treeData={treeData}
      selectedKeys={selectedKeys}
      expandedKeys={expandedKeys}
      onSelect={handleSelect}
      onExpand={handleExpand}
      blockNode
    />
  );
}
