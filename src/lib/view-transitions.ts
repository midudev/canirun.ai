const NON_IDENTIFIER_CHARS = /[^a-zA-Z0-9_-]/g

function toSafeTransitionSuffix(value: string): string {
  return value.replace(NON_IDENTIFIER_CHARS, (char) => `_${char.codePointAt(0)?.toString(16)}`)
}

export function getModelTitleTransitionName(modelId: string): string {
  return `model-title-${toSafeTransitionSuffix(modelId)}`
}
