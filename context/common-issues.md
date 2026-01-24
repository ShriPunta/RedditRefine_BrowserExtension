# Common Issues Quick Reference

| Error | Cause | Fix |
|-------|-------|-----|
| "Unsafe assignment to innerHTML" | Using `element.innerHTML = ...` | Use `createElement()` + `textContent` |
| "data_collection_permissions missing" | Missing manifest field | Add to manifest root: `{"enabled": false}` |
| "Expected object instead of []" | Wrong type/placement | Move to root, use object not array |

**Last Updated**: 2024-01-24
