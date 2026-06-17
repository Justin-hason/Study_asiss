import { useState } from 'react';
import { Typography, Card, Row, Col } from 'antd';
import FolderTree from './FolderTree';

const { Title, Text } = Typography;

export default function KnowledgeBasePage() {
  const [selectedFolderId, setSelectedFolderId] = useState<string | undefined>(undefined);

  return (
    <div>
      <Title level={2}>知识库</Title>
      <Row gutter={24}>
        <Col span={6}>
          <Card title="目录" size="small">
            <FolderTree
              selectedFolderId={selectedFolderId}
              onSelect={setSelectedFolderId}
            />
          </Card>
        </Col>
        <Col span={18}>
          <Card size="small">
            {selectedFolderId ? (
              <Text>已选择文件夹: {selectedFolderId}</Text>
            ) : (
              <Text>已选择: 全部文档</Text>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
