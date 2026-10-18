export interface InputField {
  name: string;
  label: string;
  type: 'string' | 'number' | 'integer' | 'boolean' | 'file' | 'files';
  accept?: string;
  maxSizeMB?: number;
  maxFiles?: number;
  required: boolean;
  help?: string;
  placeholder?: string;
  multiline?: boolean;
  inputType?: 'date';
  options?: string[];
  optionLabels?: Record<string, string>;
  default?: unknown;
  min?: number;
  max?: number;
}

/** Valores iniciais de um formulário: `default` do schema ou primeira opção de um enum. */
export function defaultInput(fields: InputField[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.default !== undefined) out[f.name] = f.default;
    else if (f.options && f.options.length > 0 && f.required) out[f.name] = f.options[0];
  }
  return out;
}
