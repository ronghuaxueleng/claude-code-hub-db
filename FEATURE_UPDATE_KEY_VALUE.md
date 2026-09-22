# 手动修改用户秘钥功能

## 功能概述

此功能允许管理员和密钥所有者手动修改已有密钥的值，而无需删除重建。

## 功能特性

✅ **权限控制**：
- 用户只能修改自己的密钥
- 管理员可以修改所有用户的密钥

✅ **安全验证**：
- 需要输入两次新密钥值以确认
- 检查密钥长度（10-500字符）
- 检查密钥值是否已被其他密钥使用
- 提供警告提示，避免误操作

✅ **多语言支持**：
- 中文（zh-CN）
- 英文（en）

## 使用方法

### 1. 进入用户管理页面
访问 `/dashboard/users`

### 2. 找到要修改的密钥
在用户列表中展开用户，找到对应的密钥行

### 3. 点击修改密钥按钮
在密钥行的操作区域，点击 🔑 图标（修改密钥按钮）

### 4. 输入新密钥值
- 在"新密钥值"输入框中输入新的密钥
- 在"确认密钥值"输入框中再次输入相同的密钥
- 阅读警告信息，确认修改后旧密钥将失效

### 5. 确认修改
点击"确认修改"按钮，系统将：
- 验证两次输入是否一致
- 验证密钥格式
- 检查密钥是否重复
- 更新密钥值
- 刷新页面显示

## 技术实现

### 后端 (Server Actions)

**文件**: `src/actions/keys.ts`

新增函数 `updateKeyValue`:
```typescript
export async function updateKeyValue(
  keyId: number,
  data: { newKey: string }
): Promise<ActionResult>
```

**功能**:
- 权限验证（管理员或密钥所有者）
- 密钥格式验证（长度10-500字符）
- 密钥唯一性检查
- 数据库更新

### 前端组件

**文件**: `src/app/[locale]/dashboard/_components/user/update-key-value-dialog.tsx`

**功能**:
- 双重输入确认
- 实时验证
- 警告提示
- 国际化支持

### 数据库更新

**文件**: `src/repository/key.ts`

在 `updateKey` 函数中增加对 `key` 字段的更新支持。

**类型定义**: `src/types/key.ts`

在 `UpdateKeyData` 接口中添加:
```typescript
key?: string;
```

### 翻译文件

**中文** (`messages/zh-CN/dashboard.json`):
```json
{
  "userManagement": {
    "updateKeyValue": {
      "title": "修改密钥值",
      "description": "为密钥 {keyName} 设置新的密钥值",
      ...
    }
  }
}
```

**英文** (`messages/en/dashboard.json`):
```json
{
  "userManagement": {
    "updateKeyValue": {
      "title": "Update Key Value",
      "description": "Set a new key value for {keyName}",
      ...
    }
  }
}
```

### 错误处理

新增错误码：`DUPLICATE_KEY`
- **中文**: "密钥值已被使用"
- **英文**: "This key value is already in use"

## UI/UX 设计

### 按钮位置
修改密钥按钮位于密钥行的操作区域，在"编辑"按钮之后，使用 🔑 (KeyIcon) 图标。

### 对话框布局
- 标题：修改密钥值
- 描述：显示密钥名称
- 输入字段1：新密钥值（带格式提示）
- 输入字段2：确认密钥值（再次输入）
- 警告框：黄色背景，提醒用户修改后的影响
- 操作按钮：取消 / 确认修改

### 警告信息
⚠️ 警告：修改密钥后，所有使用旧密钥的客户端将无法访问，请确保及时更新客户端配置。

## 安全考虑

1. **权限控制**: 严格限制只有管理员或密钥所有者可以修改
2. **唯一性检查**: 防止密钥重复
3. **格式验证**: 确保密钥长度合理
4. **操作日志**: 记录所有密钥修改操作
5. **双重确认**: 要求用户输入两次以防误操作

## 测试建议

### 功能测试
1. ✅ 普通用户修改自己的密钥
2. ✅ 普通用户尝试修改他人的密钥（应失败）
3. ✅ 管理员修改任意用户的密钥
4. ✅ 输入重复的密钥值（应提示已使用）
5. ✅ 输入过短的密钥（<10字符，应失败）
6. ✅ 输入过长的密钥（>500字符，应失败）
7. ✅ 两次输入不一致（应提示不匹配）

### 集成测试
1. ✅ 修改后旧密钥立即失效
2. ✅ 修改后新密钥可以正常使用
3. ✅ 页面数据自动刷新

## 相关文件清单

### 新增文件
- `src/app/[locale]/dashboard/_components/user/update-key-value-dialog.tsx`
- `FEATURE_UPDATE_KEY_VALUE.md` (本文档)

### 修改文件
- `src/actions/keys.ts` - 新增 `updateKeyValue` 函数
- `src/repository/key.ts` - 更新 `updateKey` 支持 key 字段
- `src/types/key.ts` - UpdateKeyData 添加 key 字段
- `src/app/[locale]/dashboard/_components/user/key-row-item.tsx` - 添加修改按钮
- `src/app/[locale]/dashboard/users/users-page-client.tsx` - 传递翻译
- `src/lib/utils/error-messages.ts` - 添加 DUPLICATE_KEY 错误码
- `messages/zh-CN/dashboard.json` - 中文翻译
- `messages/en/dashboard.json` - 英文翻译
- `messages/zh-CN/common.json` - 中文通用翻译
- `messages/en/common.json` - 英文通用翻译
- `messages/zh-CN/errors.json` - 中文错误信息
- `messages/en/errors.json` - 英文错误信息

## 后续优化建议

1. **操作审计**: 在数据库中记录密钥修改历史
2. **批量修改**: 支持批量修改多个密钥
3. **密钥生成器**: 提供随机生成强密钥的功能
4. **密钥验证**: 支持验证密钥格式（如 sk-xxx 格式）
5. **通知功能**: 修改后发送邮件/通知给用户
