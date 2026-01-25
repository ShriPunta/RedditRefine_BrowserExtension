# Project Learnings

## Firefox Extension Development

### Manifest Requirements
**Issue**: Missing data_collection_permissions
**Solution**: Required field in Firefox manifests
```json
{
  "data_collection_permissions": {
    "enabled": false
  }
}
```
**Date**: 2024-01-24

### Security: innerHTML Usage
**Issue**: Firefox validator rejects innerHTML
**Solution**: Use DOM methods
```javascript
// ❌ Avoid
element.innerHTML = content;

// ✅ Use
const el = document.createElement('div');
el.textContent = content;
parent.appendChild(el);
```
**Date**: 2024-01-24

## Pack Versioning System
**Pattern**: Auto-update subscribed packs
**Implementation**:
- Version stored in pack definition: `{ version: "1.0.0", ... }`
- User's subscribed versions tracked: `packVersions: Record<packId, version>`
- On popup load, compare subscribed vs current versions
- Auto-merge new items if version changed
- User edits preserved (items without source tracking won't be removed)

**Testing approach** (manual - no test framework):
1. Subscribe to pack → verify `packVersions` stored
2. Edit filter-packs.json: bump version + add new keyword
3. Reload popup → verify new keyword auto-merged
4. Check console for update log messages

**Date**: 2026-01-25