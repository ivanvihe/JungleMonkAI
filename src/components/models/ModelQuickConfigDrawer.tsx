import React, { useEffect } from 'react';
import { Drawer, Form, FormInstance, Input, InputNumber, Space, Switch, Typography } from 'antd';
import { DatabaseOutlined } from '@ant-design/icons';
import type { ModelPreferences } from '../../types/globalSettings';
import { ProSectionCard } from '../pro';

interface ModelQuickConfigDrawerProps {
  open: boolean;
  preferences: ModelPreferences;
  onClose: () => void;
  onPreferencesChange: (next: ModelPreferences) => void;
}

interface ModelPreferencesForm {
  storageDir: string | null;
  huggingFaceApiBaseUrl: string;
  huggingFaceMaxResults: number;
  huggingFaceUseStoredToken: boolean;
}

const mapPreferencesToForm = (preferences: ModelPreferences): ModelPreferencesForm => ({
  storageDir: preferences.storageDir,
  huggingFaceApiBaseUrl: preferences.huggingFace.apiBaseUrl,
  huggingFaceMaxResults: preferences.huggingFace.maxResults,
  huggingFaceUseStoredToken: preferences.huggingFace.useStoredToken,
});

const commitFormToPreferences = (
  formValues: ModelPreferencesForm,
  previous: ModelPreferences,
): ModelPreferences => ({
  ...previous,
  storageDir: formValues.storageDir ?? null,
  huggingFace: {
    ...previous.huggingFace,
    apiBaseUrl: formValues.huggingFaceApiBaseUrl,
    maxResults: formValues.huggingFaceMaxResults,
    useStoredToken: formValues.huggingFaceUseStoredToken,
  },
});

const syncFormWithPreferences = (form: FormInstance<ModelPreferencesForm>, preferences: ModelPreferences) => {
  form.setFieldsValue(mapPreferencesToForm(preferences));
};

export const ModelQuickConfigDrawer: React.FC<ModelQuickConfigDrawerProps> = ({
  open,
  preferences,
  onClose,
  onPreferencesChange,
}) => {
  const [form] = Form.useForm<ModelPreferencesForm>();

  useEffect(() => {
    syncFormWithPreferences(form, preferences);
  }, [form, preferences]);

  return (
    <Drawer
      title={
        <Space size={8} align="center">
          <DatabaseOutlined />
          <Typography.Text strong>Configuración rápida de modelos</Typography.Text>
        </Space>
      }
      placement="right"
      width={460}
      onClose={onClose}
      open={open}
      destroyOnClose={false}
    >
      <Typography.Paragraph type="secondary">
        Ajusta preferencias básicas de almacenamiento y consultas a Hugging Face sin abandonar el flujo de trabajo
        principal.
      </Typography.Paragraph>

      <Form<ModelPreferencesForm>
        form={form}
        layout="vertical"
        onValuesChange={(_, values) => onPreferencesChange(commitFormToPreferences(values, preferences))}
        initialValues={mapPreferencesToForm(preferences)}
      >
        <ProSectionCard title="Almacenamiento">
          <Form.Item<ModelPreferencesForm>
            label="Directorio local"
            name="storageDir"
            tooltip="Ruta donde se almacenan los modelos descargados. Déjalo vacío para usar el valor por defecto."
          >
            <Input placeholder="~/modelos" allowClear />
          </Form.Item>
        </ProSectionCard>

        <ProSectionCard title="Hugging Face">
          <Form.Item<ModelPreferencesForm>
            label="Endpoint"
            name="huggingFaceApiBaseUrl"
            tooltip="URL base utilizada para las consultas a la API de Hugging Face."
          >
            <Input placeholder="https://huggingface.co" />
          </Form.Item>

          <Form.Item<ModelPreferencesForm>
            label="Máximo de resultados"
            name="huggingFaceMaxResults"
            tooltip="Número máximo de modelos sugeridos en las búsquedas rápidas."
          >
            <InputNumber min={1} max={100} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item<ModelPreferencesForm>
            label="Usar token almacenado"
            name="huggingFaceUseStoredToken"
            valuePropName="checked"
            tooltip="Controla si se utiliza el token guardado en el dispositivo para autenticarse automáticamente."
          >
            <Switch checkedChildren="Sí" unCheckedChildren="No" />
          </Form.Item>
        </ProSectionCard>
      </Form>
    </Drawer>
  );
};

export default ModelQuickConfigDrawer;
