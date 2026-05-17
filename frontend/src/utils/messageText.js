const INTERNAL_COMMENT_RE = /<!--[\s\S]*?-->/g;
const ACTION_BLOCK_RE = /```(?:json)?[\s\S]*?```/gi;

export const cleanMessageText = (content = '') => (
    String(content)
        .replace(ACTION_BLOCK_RE, '')
        .replace(INTERNAL_COMMENT_RE, '')
        .trim()
);
