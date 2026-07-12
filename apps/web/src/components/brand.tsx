import { Box, Text } from "@mantine/core";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="Introspect">
      <Box className="brand-mark" aria-hidden="true">
        <span />
      </Box>
      {!compact && (
        <Text component="span" className="brand-name">
          Introspect
        </Text>
      )}
    </div>
  );
}
