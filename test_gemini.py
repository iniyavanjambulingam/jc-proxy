import urllib.request, json
url = "http://localhost:3000/v1/chat/completions"
headers = {'Content-Type': 'application/json', 'Authorization': 'Bearer sk-your-app-api-key-1'}
req = urllib.request.Request(url, headers=headers)
data = {
  "model": "gemini-3.1-flash-lite-preview",
  "messages": [
    {"role": "user", "content": "hello"},
    {"role": "assistant", "tool_calls": [{"id": "call_123", "type": "function", "function": {"name": "test", "arguments": "{}"}}]},
    {"role": "tool", "tool_call_id": "call_123", "name": "test", "content": "result"}
  ]
}
try:
  res = urllib.request.urlopen(req, data=json.dumps(data).encode('utf-8'))
  print(res.read().decode('utf-8'))
except urllib.error.HTTPError as e:
  print(e.read().decode('utf-8'))
