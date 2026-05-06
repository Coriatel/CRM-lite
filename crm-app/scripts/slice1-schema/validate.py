#!/usr/bin/env python3
import json, os, sys, urllib.request, urllib.error, time
URL = os.environ.get("DIRECTUS_URL")
TOK = os.environ.get("DIRECTUS_ADMIN_TOKEN")
if not URL or not TOK:
    print("ERROR: set DIRECTUS_URL and DIRECTUS_ADMIN_TOKEN env vars", file=sys.stderr)
    sys.exit(2)
H = {"Authorization": f"Bearer {TOK}", "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 slice1-validate"}

def req(method, path, body=None):
    d = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(URL+path, data=d, method=method, headers=H)
    try:
        with urllib.request.urlopen(r) as resp:
            txt = resp.read().decode()
            return resp.status, (json.loads(txt) if txt else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

print("=== 1. verify contacts.lifecycle_stage_id field exists ===")
code, data = req("GET", "/fields/contacts/lifecycle_stage_id")
f = data["data"]
print(f"  field={f['field']} type={f['type']} nullable={f['schema']['is_nullable']} fk={f['schema'].get('foreign_key_table')}")

print("\n=== 2. verify 9 seed stages ===")
code, data = req("GET", "/items/lifecycle_stages?fields=id,slug,name,sort_order,color&sort=sort_order&limit=20")
stages = {s["slug"]: s for s in data["data"]}
for s in data["data"]:
    print(f"  {s['sort_order']:>2} {s['slug']:<22} {s['name']}  ({s['color']})")
print(f"  total={len(data['data'])}")
assert len(data["data"]) == 9, "expected 9 stages"

print("\n=== 3. find/create test contact ===")
code, data = req("GET", "/items/contacts?fields=id,full_name&filter[full_name][_eq]=test_slice1_dummy&limit=1")
if data["data"]:
    contact_id = data["data"][0]["id"]
    print(f"  ✓ reusing test contact: {contact_id}")
else:
    code, data = req("POST", "/items/contacts", {"full_name": "test_slice1_dummy", "phone_e164": "+972000000000", "status": "inactive"})
    contact_id = data["data"]["id"]
    print(f"  + created test contact: {contact_id}")

lead_id = stages["lead"]["id"]
print(f"  using lead stage id: {lead_id}")

print("\n=== 4. PATCH contact.lifecycle_stage_id ===")
t0 = time.time()
code, data = req("PATCH", f"/items/contacts/{contact_id}", {"lifecycle_stage_id": lead_id})
print(f"  HTTP {code}  ({(time.time()-t0)*1000:.0f}ms)")
assert code == 200, f"PATCH failed: {data}"

print("\n=== 5. POST stage_transitions ===")
t0 = time.time()
code, data = req("POST", "/items/stage_transitions", {
    "contact_id": contact_id, "from_stage_id": None, "to_stage_id": lead_id,
    "trigger_type": "system", "reason": "slice1 validation gate",
})
print(f"  HTTP {code}  ({(time.time()-t0)*1000:.0f}ms)")
trans_id = data["data"]["id"]
print(f"  + transition id: {trans_id}")

print("\n=== 6. verify roundtrip (deep read) ===")
code, data = req("GET", f"/items/contacts/{contact_id}?fields=id,full_name,lifecycle_stage_id.slug,lifecycle_stage_id.name")
print(f"  HTTP {code}")
print("  contact:", json.dumps(data["data"], ensure_ascii=False))
assert data["data"]["lifecycle_stage_id"]["slug"] == "lead"

print("\n=== 7. filter contacts by stage (latency) ===")
times = []
for i in range(5):
    t0 = time.time()
    code, data = req("GET", f"/items/contacts?fields=id,full_name&filter[lifecycle_stage_id][_eq]={lead_id}&limit=10")
    times.append((time.time()-t0)*1000)
matched = len(data["data"])
print(f"  matched: {matched} contacts")
print(f"  latency ms: min={min(times):.0f} max={max(times):.0f} avg={sum(times)/len(times):.0f}")
assert max(times) < 1000, f"latency too high: {max(times)}ms"

print("\n=== 8. read transition history for test contact ===")
code, data = req("GET", f"/items/stage_transitions?fields=id,from_stage_id,to_stage_id.slug,trigger_type,reason,transitioned_at&filter[contact_id][_eq]={contact_id}&sort=-transitioned_at&limit=5")
print(f"  HTTP {code}  found {len(data['data'])} transitions")
for t in data["data"]:
    print(f"    {t['transitioned_at']}  {t['trigger_type']}: → {t['to_stage_id']['slug']}  ({t['reason']})")

print("\n=== ALL VALIDATION GATES PASSED ✓ ===")
print(f"  test contact id: {contact_id}")
print(f"  lead stage id: {lead_id}")
print(f"  transition id: {trans_id}")
