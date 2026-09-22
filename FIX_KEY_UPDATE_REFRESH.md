# 修复密钥修改后需要刷新页面的问题 ✅

## 问题描述
修改密钥后，新密钥值不会立即显示，需要手动刷新页面才能看到更新。

## 解决方案
添加了完整的数据刷新回调链，从顶层组件传递到密钥行组件，确保修改后立即刷新数据。

## 修改文件

### 1. `src/app/[locale]/dashboard/_components/user/key-row-item.tsx`
**变更**:
- 在 `KeyRowItemProps` 接口中添加 `onKeyUpdated?: () => void;` 回调
- 在组件参数中解构 `onKeyUpdated`
- 在 `UpdateKeyValueDialog` 的 `onSuccess` 中调用 `onKeyUpdated?.()`

**代码片段**:
```typescript
export interface KeyRowItemProps {
  // ... 其他属性
  onKeyUpdated?: () => void;
}

// UpdateKeyValueDialog 回调
onSuccess={() => {
  onKeyUpdated?.();  // 👈 调用回调刷新数据
  router.refresh();
}}
```

### 2. `src/app/[locale]/dashboard/_components/user/user-key-table-row.tsx`
**变更**:
- 在 `UserKeyTableRowProps` 接口中添加 `onKeyUpdated?: () => void;`
- 在组件参数中解构 `onKeyUpdated`
- 传递 `onKeyUpdated` 给 `KeyRowItem` 组件

**代码片段**:
```typescript
export interface UserKeyTableRowProps {
  // ... 其他属性
  onKeyUpdated?: () => void;
}

// 传递给 KeyRowItem
<KeyRowItem
  // ... 其他 props
  onKeyUpdated={onKeyUpdated}
/>
```

### 3. `src/app/[locale]/dashboard/_components/user/user-management-table.tsx`
**变更**:
- 在 `UserManagementTableProps` 接口中添加 `onKeyUpdated?: () => void;`
- 在组件参数中解构 `onKeyUpdated`
- 传递 `onKeyUpdated` 给 `UserKeyTableRow` 组件

**代码片段**:
```typescript
export interface UserManagementTableProps {
  // ... 其他属性
  onKeyUpdated?: () => void;
}

// 传递给 UserKeyTableRow
<UserKeyTableRow
  // ... 其他 props
  onKeyUpdated={onKeyUpdated}
/>
```

### 4. `src/app/[locale]/dashboard/users/users-page-client.tsx`
**变更**:
- 传递 `onKeyUpdated={handleKeyCreated}` 给 `UserManagementTable`
- `handleKeyCreated` 调用 `queryClient.invalidateQueries({ queryKey: ["users"] })` 刷新数据

**代码片段**:
```typescript
<UserManagementTable
  // ... 其他 props
  onKeyUpdated={handleKeyCreated}  // 👈 使用现有的 handleKeyCreated
/>

// handleKeyCreated 实现
const handleKeyCreated = useCallback(() => {
  queryClient.invalidateQueries({ queryKey: ["users"] });
}, [queryClient]);
```

## 数据流

```
用户点击确认修改
    ↓
UpdateKeyValueDialog.onSuccess 回调
    ↓
KeyRowItem.onKeyUpdated?.()
    ↓
UserKeyTableRow.onKeyUpdated?.()
    ↓
UserManagementTable.onKeyUpdated?.()
    ↓
UsersPageClient.handleKeyCreated()
    ↓
queryClient.invalidateQueries({ queryKey: ["users"] })
    ↓
React Query 重新获取数据
    ↓
UI 自动更新显示新密钥 ✅
```

## 工作原理

1. **回调链传递**: 从顶层组件 `users-page-client.tsx` 开始，通过 props 逐层传递 `onKeyUpdated` 回调
2. **React Query 集成**: 使用现有的 `handleKeyCreated` 函数，该函数调用 `queryClient.invalidateQueries` 
3. **自动刷新**: React Query 检测到查询失效后，自动重新获取最新数据
4. **UI 更新**: 组件接收到新数据后自动重新渲染

## 优点

- ✅ 复用现有的 `handleKeyCreated` 函数（创建密钥和修改密钥都用同一个刷新逻辑）
- ✅ 利用 React Query 的自动缓存和刷新机制
- ✅ 无需手动刷新页面
- ✅ 用户体验更好，修改后立即看到新密钥
- ✅ 代码简洁，逻辑清晰

## 测试验证

1. 登录系统
2. 访问 `/dashboard/users`
3. 展开任意用户，查看密钥列表
4. 点击密钥行的 🔑 按钮
5. 输入新密钥（两次）
6. 点击"确认修改"
7. **验证**: 修改成功后，密钥值立即更新，无需刷新页面 ✅

## 相关文件

- `src/app/[locale]/dashboard/_components/user/key-row-item.tsx`
- `src/app/[locale]/dashboard/_components/user/user-key-table-row.tsx`
- `src/app/[locale]/dashboard/_components/user/user-management-table.tsx`
- `src/app/[locale]/dashboard/users/users-page-client.tsx`

## 额外说明

此修复也适用于其他密钥相关操作（创建、删除等），因为它们都使用相同的 `queryClient.invalidateQueries` 机制。

---

**修复完成时间**: 2024-01-XX
**问题状态**: ✅ 已解决
