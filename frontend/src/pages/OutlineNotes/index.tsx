import { useState, useEffect } from 'react';
import {
  Card,
  Tabs,
  List,
  Button,
  Modal,
  Form,
  Input,
  message,
  Empty,
  Spin,
  Space,
  Tree,
  Typography,
  Popconfirm,
  Divider,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ExportOutlined,
  FileTextOutlined,
  FolderOutlined,
} from '@ant-design/icons';
import {
  getNotes,
  createNote,
  updateNote,
  deleteNote,
  generateOutline,
  exportOutline,
  type Note,
  type Outline,
  type OutlineContent,
} from '../../api/outline';

const { TextArea } = Input;
const { Text, Title } = Typography;
const { TabPane } = Tabs;

export default function OutlineNotesPage() {
  const [activeTab, setActiveTab] = useState('notes');

  // 笔记相关
  const [notes, setNotes] = useState<Note[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [noteForm] = Form.useForm();

  // 大纲相关
  const [outlines] = useState<Outline[]>([]);
  const [outlinesLoading] = useState(false);
  const [selectedOutline, setSelectedOutline] = useState<Outline | null>(null);
  const [outlineModalVisible, setOutlineModalVisible] = useState(false);
  const [outlineForm] = Form.useForm();

  useEffect(() => {
    loadNotes();
  }, []);

  const loadNotes = async () => {
    setNotesLoading(true);
    try {
      const data = await getNotes();
      setNotes(data);
    } catch (error) {
      message.error('加载笔记失败');
    } finally {
      setNotesLoading(false);
    }
  };

  const handleCreateNote = async (values: any) => {
    try {
      await createNote(values.content);
      message.success('创建成功');
      setNoteModalVisible(false);
      noteForm.resetFields();
      loadNotes();
    } catch (error) {
      message.error('创建失败');
    }
  };

  const handleUpdateNote = async (values: any) => {
    if (!editingNote) return;
    try {
      await updateNote(editingNote.id, values.content);
      message.success('更新成功');
      setNoteModalVisible(false);
      setEditingNote(null);
      noteForm.resetFields();
      loadNotes();
    } catch (error) {
      message.error('更新失败');
    }
  };

  const handleDeleteNote = async (id: string) => {
    try {
      await deleteNote(id);
      message.success('删除成功');
      loadNotes();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const openNoteModal = (note?: Note) => {
    if (note) {
      setEditingNote(note);
      noteForm.setFieldsValue({ content: note.content });
    } else {
      setEditingNote(null);
      noteForm.resetFields();
    }
    setNoteModalVisible(true);
  };

  const handleGenerateOutline = async (values: any) => {
    try {
      const outline = await generateOutline(undefined, values.title);
      message.success('生成成功');
      setOutlineModalVisible(false);
      outlineForm.resetFields();
      setSelectedOutline(outline);
      setActiveTab('outlines');
    } catch (error) {
      message.error('生成失败');
    }
  };

  const handleExportOutline = async () => {
    if (!selectedOutline) return;
    try {
      const result = await exportOutline(selectedOutline.id, 'markdown');
      const blob = new Blob([result.content], { type: 'text/markdown' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      a.click();
      window.URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch (error) {
      message.error('导出失败');
    }
  };

  const convertOutlineToTreeData = (content: OutlineContent) => {
    if (!content || !content.sections) return [];

    const convertSection = (section: any, key: string): any => ({
      title: section.title,
      key,
      children: section.children?.map((child: any, idx: number) =>
        convertSection(child, `${key}-${idx}`)
      ),
    });

    return content.sections.map((section, idx) => convertSection(section, `section-${idx}`));
  };

  return (
    <div>
      <h2>大纲笔记</h2>

      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <TabPane tab="我的笔记" key="notes">
          <Card
            title="笔记列表"
            extra={
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openNoteModal()}>
                新建笔记
              </Button>
            }
          >
            <Spin spinning={notesLoading}>
              {notes.length === 0 ? (
                <Empty description="暂无笔记" />
              ) : (
                <List
                  dataSource={notes}
                  renderItem={(item) => (
                    <List.Item
                      actions={[
                        <Button type="link" icon={<EditOutlined />} onClick={() => openNoteModal(item)}>
                          编辑
                        </Button>,
                        <Popconfirm
                          title="确定删除这条笔记吗？"
                          onConfirm={() => handleDeleteNote(item.id)}
                          okText="确定"
                          cancelText="取消"
                        >
                          <Button type="link" danger icon={<DeleteOutlined />}>
                            删除
                          </Button>
                        </Popconfirm>,
                      ]}
                    >
                      <List.Item.Meta
                        avatar={<FileTextOutlined style={{ fontSize: 24, color: '#1890ff' }} />}
                        title={
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            创建于 {new Date(item.created_at).toLocaleString()}
                          </Text>
                        }
                        description={
                          <Text ellipsis={{ tooltip: item.content }}>
                            {item.content}
                          </Text>
                        }
                      />
                    </List.Item>
                  )}
                />
              )}
            </Spin>
          </Card>
        </TabPane>

        <TabPane tab="大纲管理" key="outlines">
          <Card
            title="大纲列表"
            extra={
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setOutlineModalVisible(true)}>
                生成大纲
              </Button>
            }
          >
            <Space align="start" style={{ width: '100%' }} size="large">
              <div style={{ width: 300 }}>
                <Spin spinning={outlinesLoading}>
                  {outlines.length === 0 ? (
                    <Empty description="暂无大纲" />
                  ) : (
                    <List
                      size="small"
                      dataSource={outlines}
                      renderItem={(item) => (
                        <List.Item
                          style={{
                            cursor: 'pointer',
                            backgroundColor: selectedOutline?.id === item.id ? '#e6f7ff' : undefined,
                            padding: '8px 12px',
                          }}
                          onClick={() => setSelectedOutline(item)}
                        >
                          <Space>
                            <FolderOutlined />
                            <Text>{item.title}</Text>
                          </Space>
                        </List.Item>
                      )}
                    />
                  )}
                </Spin>
              </div>

              <Divider type="vertical" style={{ height: 'auto' }} />

              <div style={{ flex: 1 }}>
                {selectedOutline ? (
                  <>
                    <Space style={{ marginBottom: 16 }}>
                      <Title level={4}>{selectedOutline.title}</Title>
                      <Button icon={<ExportOutlined />} onClick={handleExportOutline}>
                        导出 Markdown
                      </Button>
                    </Space>
                    <Tree
                      treeData={convertOutlineToTreeData(selectedOutline.content)}
                      defaultExpandAll
                      style={{ padding: 16, backgroundColor: '#fafafa', borderRadius: 8 }}
                    />
                  </>
                ) : (
                  <Empty description="选择一个大纲查看" />
                )}
              </div>
            </Space>
          </Card>
        </TabPane>
      </Tabs>

      {/* 笔记编辑模态框 */}
      <Modal
        title={editingNote ? '编辑笔记' : '新建笔记'}
        open={noteModalVisible}
        onCancel={() => {
          setNoteModalVisible(false);
          setEditingNote(null);
          noteForm.resetFields();
        }}
        footer={null}
      >
        <Form form={noteForm} layout="vertical" onFinish={editingNote ? handleUpdateNote : handleCreateNote}>
          <Form.Item
            name="content"
            label="笔记内容"
            rules={[{ required: true, message: '请输入笔记内容' }]}
          >
            <TextArea rows={8} placeholder="输入笔记内容..." />
          </Form.Item>
          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button
                onClick={() => {
                  setNoteModalVisible(false);
                  setEditingNote(null);
                  noteForm.resetFields();
                }}
              >
                取消
              </Button>
              <Button type="primary" htmlType="submit">
                {editingNote ? '保存' : '创建'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 生成大纲模态框 */}
      <Modal
        title="生成大纲"
        open={outlineModalVisible}
        onCancel={() => {
          setOutlineModalVisible(false);
          outlineForm.resetFields();
        }}
        footer={null}
      >
        <Form form={outlineForm} layout="vertical" onFinish={handleGenerateOutline}>
          <Form.Item
            name="title"
            label="大纲标题"
            rules={[{ required: true, message: '请输入大纲标题' }]}
          >
            <Input placeholder="输入大纲标题..." />
          </Form.Item>
          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setOutlineModalVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit">
                生成
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
