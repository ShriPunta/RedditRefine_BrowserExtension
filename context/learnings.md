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