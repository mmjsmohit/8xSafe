import React from "react";

function mockComponent(name: string) {
  const Component = ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement(name, props, children);
  Component.displayName = name;
  return Component;
}

function flattenStyle(style: unknown): Record<string, unknown> {
  if (style == null) {
    return {};
  }
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (acc, entry) => Object.assign(acc, flattenStyle(entry)),
      {}
    );
  }
  return style as Record<string, unknown>;
}

function renderListSlot(slot: React.ReactNode | React.ComponentType | null | undefined) {
  if (slot == null) {
    return null;
  }
  if (React.isValidElement(slot)) {
    return slot;
  }
  if (typeof slot === "function") {
    return React.createElement(slot);
  }
  return null;
}

export const FlatList = ({
  data,
  renderItem,
  ListHeaderComponent,
  ListEmptyComponent,
  ListFooterComponent
}: {
  data?: unknown[];
  renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
  ListHeaderComponent?: React.ReactNode | React.ComponentType | null;
  ListEmptyComponent?: React.ReactNode | React.ComponentType | null;
  ListFooterComponent?: React.ReactNode | React.ComponentType | null;
}) => {
  const header = renderListSlot(ListHeaderComponent);
  const footer = renderListSlot(ListFooterComponent);
  const items = data?.length
    ? data.map((item, index) => renderItem({ item, index }))
    : renderListSlot(ListEmptyComponent);
  return React.createElement("FlatList", null, header, items, footer);
};

export const ActivityIndicator = mockComponent("ActivityIndicator");
export const Platform = {
  OS: "ios",
  select: (values: { ios?: unknown; default?: unknown }) => values.ios ?? values.default
};
export const Pressable = mockComponent("Pressable");
export const RefreshControl = mockComponent("RefreshControl");
export const ScrollView = mockComponent("ScrollView");
export const StyleSheet = {
  create: <T extends Record<string, unknown>>(styles: T) => styles,
  flatten: flattenStyle,
  hairlineWidth: 1
};
export const Text = mockComponent("Text");
export const View = mockComponent("View");
