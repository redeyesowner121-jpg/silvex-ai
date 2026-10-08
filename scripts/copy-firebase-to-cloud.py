"""One-time (re-runnable) copy of the Firebase store into Lovable Cloud.

Usage: python3 scripts/copy-firebase-to-cloud.py /tmp/fb.json
Needs SUPABASE_DB_URL. Wipes and reloads the store tables each run; it never
touches login accounts or roles. Prints totals to compare with Firebase.
"""
import json, sys, os, subprocess, tempfile, datetime

SRC = next((a for a in sys.argv[1:] if not a.startswith("--")), "/tmp/fb.json")
d = json.load(open(SRC))

def iso(v):
    if isinstance(v, (int, float)) and v > 1e11:
        return datetime.datetime.utcfromtimestamp(v / 1000).isoformat() + "Z"
    if isinstance(v, str) and len(v) >= 10:
        return v
    return None

def num(v, default=0):
    try:
        f = float(v)
    except Exception:
        return default
    # Junk values (e.g. a tx hash typed as an amount) can't be real money.
    return f if abs(f) < 1e9 else default

def q(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, (dict, list)):
        v = json.dumps(v, ensure_ascii=False)
    return "'" + str(v).replace("'", "''") + "'"

def tg(v):
    try:
        return int(str(v).strip())
    except Exception:
        return None

WIPE = "--wipe" in sys.argv
out = ["BEGIN;"] + ([] if not WIPE else [
       *[f"DELETE FROM public.{t};" for t in ("wallet_history","customer_alerts","reviews","orders","used_stock","product_stock","payments","requests","push_subscriptions","notifications","settings","kv_store")],
       "DELETE FROM public.products;",
       # keep login links: remember them by legacy uid, then reload customers
       "CREATE TEMP TABLE keep_links AS SELECT legacy_uid, auth_user_id FROM public.customers WHERE auth_user_id IS NOT NULL;",
       "DELETE FROM public.customers;"])

users = d.get("users") or {}
seen_tg, seen_ref, seen_key = set(), set(), set()
KNOWN = {"wallet","email","myRefCode","name","joined","telegramChatId","source","history","apiEnabled","apiKey","refBy","usedRef","phone","isAdmin","isOwner","refEarned","alerts","used_coupons","totalDeposit","refBonusDone","telegramUsername"} - {"isAdmin","isOwner"}
for uid, u in users.items():
    if not isinstance(u, dict):
        continue
    t = tg(u.get("telegramChatId"))
    if t in seen_tg: t = None
    if t: seen_tg.add(t)
    rc = u.get("myRefCode")
    if rc in seen_ref: rc = None
    if rc: seen_ref.add(rc)
    ak = u.get("apiKey")
    if ak in seen_key: ak = None
    if ak: seen_key.add(ak)
    extra = {k: v for k, v in u.items() if k not in KNOWN}
    out.append(
        "INSERT INTO public.customers (legacy_uid,email,name,phone,ref_code,ref_by,used_ref,ref_bonus_done,ref_earned,wallet,total_deposit,telegram_chat_id,telegram_username,source,api_key,api_enabled,used_coupons,extra,joined_at) VALUES ("
        + ",".join([q(uid), q(u.get("email") or None), q(u.get("name") or "User"), q(u.get("phone")), q(rc), q(u.get("refBy")), q(u.get("usedRef")),
                    q(bool(u.get("refBonusDone"))), q(num(u.get("refEarned"))), q(max(0, num(u.get("wallet")))), q(num(u.get("totalDeposit"))),
                    q(t), q(u.get("telegramUsername")), q(u.get("source")), q(ak), q(bool(u.get("apiEnabled"))),
                    q(u.get("used_coupons") or {}), q(extra), q(iso(u.get("joined")) or "now()")]).replace("'now()'", "now()")
        + ");")
    for hid, e in (u.get("history") or {}).items():
        if not isinstance(e, dict): continue
        ex = {k: v for k, v in e.items() if k not in ("type","amount","desc","date","by")}
        out.append(f"INSERT INTO public.wallet_history (legacy_id,customer_id,type,amount,description,by_email,extra,created_at) SELECT {q(hid)},id,{q(e.get('type') or 'Adjustment')},{q(num(e.get('amount')))},{q(e.get('desc'))},{q(e.get('by'))},{q(ex)},{q(iso(e.get('date')) or '2026-01-01')} FROM public.customers WHERE legacy_uid={q(uid)};")
    for aid, a in (u.get("alerts") or {}).items():
        if isinstance(a, dict) and a.get("msg"):
            out.append(f"INSERT INTO public.customer_alerts (customer_id,msg,created_at) SELECT id,{q(a['msg'])},{q(iso(a.get('date')) or '2026-01-01')} FROM public.customers WHERE legacy_uid={q(uid)};")

if WIPE: out.append("UPDATE public.customers c SET auth_user_id = k.auth_user_id FROM keep_links k WHERE c.legacy_uid = k.legacy_uid;")

PKNOWN = {"title","desc","price","botPrice","apiPrice","type","delivery","link","logo","hidden","hideWeb","hideBot","soldOut","locked","salesCount","provider","providerName","supplierId","supplierPrice","supplierStock","supplierSyncedAt","markup","stock"}
for pid, p in (d.get("products") or {}).items():
    if not isinstance(p, dict): continue
    extra = {k: v for k, v in p.items() if k not in PKNOWN}
    out.append("INSERT INTO public.products (id,title,description,price,bot_price,api_price,type,delivery,link,logo,hidden,hide_web,hide_bot,sold_out,locked,sales_count,provider,provider_name,supplier_id,supplier_price,supplier_stock,supplier_synced_at,markup,extra) VALUES ("
        + ",".join([q(pid), q(p.get("title") or ""), q(p.get("desc")), q(num(p.get("price"))),
                    q(num(p["botPrice"]) if p.get("botPrice") not in (None, "") else None),
                    q(num(p["apiPrice"]) if p.get("apiPrice") not in (None, "") else None),
                    q(p.get("type")), q(p.get("delivery") or "manual"), q(p.get("link")), q(p.get("logo")),
                    q(bool(p.get("hidden"))), q(bool(p.get("hideWeb"))), q(bool(p.get("hideBot"))), q(bool(p.get("soldOut"))), q(bool(p.get("locked"))),
                    q(int(num(p.get("salesCount")))), q(p.get("provider")), q(p.get("providerName")),
                    q(str(p["supplierId"]) if p.get("supplierId") is not None else None),
                    q(num(p["supplierPrice"]) if p.get("supplierPrice") is not None else None),
                    q(int(num(p["supplierStock"])) if p.get("supplierStock") is not None else None),
                    q(iso(p.get("supplierSyncedAt"))), q(num(p["markup"]) if p.get("markup") is not None else None), q(extra)])
        + ");")
    st = p.get("stock") or []
    if isinstance(st, dict): st = list(st.values())
    for s in st:
        if s: out.append(f"INSERT INTO public.product_stock (product_id,content) VALUES ({q(pid)},{q(s)});")
    for rid, r in (p.get("reviews") or {}).items():
        if isinstance(r, dict):
            out.append(f"INSERT INTO public.reviews (product_id,customer_id,name,rating,body,created_at) SELECT {q(pid)},(SELECT id FROM public.customers WHERE legacy_uid={q(r.get('uid'))}),{q(r.get('name'))},{q(min(5,max(1,int(num(r.get('rating'),5)))))},{q(r.get('text'))},{q(iso(r.get('date')) or '2026-01-01')};")

for rid, r in (d.get("reviews") or {}).items():
    if isinstance(r, dict):
        out.append(f"INSERT INTO public.reviews (product_id,customer_id,name,rating,body,created_at) SELECT NULL,(SELECT id FROM public.customers WHERE legacy_uid={q(r.get('uid'))}),{q(r.get('name'))},{q(min(5,max(1,int(num(r.get('rating'),5)))))},{q(r.get('text'))},{q(iso(r.get('date')) or '2026-01-01')};")

for pid, recs in (d.get("usedStock") or {}).items():
    for _, r in (recs or {}).items():
        if isinstance(r, dict) and r.get("content"):
            out.append(f"INSERT INTO public.used_stock (product_id,content,order_id,email,created_at) VALUES ({q(pid)},{q(r['content'])},{q(r.get('orderId'))},{q(r.get('email'))},{q(iso(r.get('date')) or '2026-01-01')});")

OKNOWN = {"uid","email","status","total","couponDiscount","coupon","source","items","delivered","note","date"}
for oid, o in (d.get("orders") or {}).items():
    if not isinstance(o, dict): continue
    items = o.get("items") or []
    if isinstance(items, dict): items = list(items.values())
    items = [{k: v for k, v in (i or {}).items() if k not in ("logo", "stock")} for i in items if isinstance(i, dict)]
    extra = {k: v for k, v in o.items() if k not in OKNOWN}
    out.append(f"INSERT INTO public.orders (id,customer_id,email,status,total,coupon,coupon_discount,source,items,delivery,note,extra,created_at) SELECT {q(oid)},(SELECT id FROM public.customers WHERE legacy_uid={q(o.get('uid'))}),{q(o.get('email'))},{q(o.get('status') or 'Pending')},{q(num(o.get('total')))},{q(o.get('coupon'))},{q(num(o.get('couponDiscount')))},{q(o.get('source'))},{q(items)},{q(o.get('delivered'))},{q(o.get('note'))},{q(extra)},{q(iso(o.get('date')) or '2026-01-01')};")

def pay(kind, node):
    for pid, r in (d.get(node) or {}).items():
        if not isinstance(r, dict): continue
        usd = r.get("usd", r.get("amount"))
        out.append(f"INSERT INTO public.payments (id,kind,customer_id,amount_usd,status,data,created_at) SELECT {q(pid)},{q(kind)},(SELECT id FROM public.customers WHERE legacy_uid={q(r.get('uid'))}),{q(num(usd) if usd is not None else None)},{q(r.get('status'))},{q(r)},{q(iso(r.get('date')) or '2026-01-01')} ON CONFLICT (id) DO NOTHING;")
pay("crypto", "deposits")
pay("razorpay_claim", "razorpayPaymentClaims")
pay("razorpay_payment", "razorpayPayments")
pay("razorpay_link", "razorpayLinks")

for rid, r in (d.get("requests") or {}).items():
    if isinstance(r, dict):
        out.append(f"INSERT INTO public.requests (legacy_id,customer_id,kind,amount,status,data,created_at) SELECT {q(rid)},(SELECT id FROM public.customers WHERE legacy_uid={q(r.get('uid'))}),{q(r.get('type'))},{q(num(r.get('amount')))},{q(r.get('status') or 'pending')},{q(r)},{q(iso(r.get('date')) or '2026-01-01')};")

for sid, sub in (d.get("pushSubs") or {}).items():
    for k, v in (sub or {}).items():
        out.append(f"INSERT INTO public.push_subscriptions (id,customer_id,data) SELECT {q(sid + '_' + k)},(SELECT id FROM public.customers WHERE legacy_uid={q(sid)}),{q(v)};")

for nid, n in (d.get("notifications") or {}).items():
    if isinstance(n, dict) and n.get("msg"):
        out.append(f"INSERT INTO public.notifications (msg,created_at) VALUES ({q(n['msg'])},{q(iso(n.get('date')) or '2026-01-01')});")

PUBLIC_SETTINGS = {"banner", "flash_sale", "button_colors"}
for k, v in (d.get("site_settings") or {}).items():
    out.append(f"INSERT INTO public.settings (key,value,is_public) VALUES ({q(k)},{q(v if isinstance(v,(dict,list)) else {'__v': v})},{q(k in PUBLIC_SETTINGS)});")

# Everything else is bot-internal: store one row per child under its path.
HANDLED = {"users","products","orders","site_settings"}  # the rest is also kept whole in kv_store for the bot
for top, val in d.items():
    if top in HANDLED: continue
    if isinstance(val, dict):
        for k, v in val.items():
            out.append(f"INSERT INTO public.kv_store (path,value) VALUES ({q(top + '/' + k)},{q(json.dumps(v))}::jsonb);")
    else:
        out.append(f"INSERT INTO public.kv_store (path,value) VALUES ({q(top)},{q(json.dumps(val))}::jsonb);")

out.append("COMMIT;")
out.append("SELECT 'customers',count(*),round(sum(wallet),2) FROM public.customers UNION ALL SELECT 'orders',count(*),round(sum(total),2) FROM public.orders UNION ALL SELECT 'history',count(*),0 FROM public.wallet_history UNION ALL SELECT 'products',count(*),0 FROM public.products UNION ALL SELECT 'stock',count(*),0 FROM public.product_stock UNION ALL SELECT 'payments',count(*),0 FROM public.payments UNION ALL SELECT 'kv',count(*),0 FROM public.kv_store;")

# Send statements in big DO blocks: one network round trip per ~1500 rows.
body = [x for x in out if x not in ("BEGIN;", "COMMIT;") and not x.startswith("SELECT 'customers'")]
final_select = out[-1]
blocks = ["BEGIN;"]
for i in range(0, len(body), 1500):
    chunk = "\n".join(body[i:i + 1500])
    assert "$mig$" not in chunk
    blocks.append("DO $mig$ BEGIN\n" + chunk + "\nEND $mig$;")
blocks += ["COMMIT;", final_select]
with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False) as f:
    f.write("\n".join(blocks))
    path = f.name
print("firebase customers", len(users), "wallet total", round(sum(max(0, num(u.get("wallet"))) for u in users.values() if isinstance(u, dict)), 2),
      "orders", len(d.get("orders") or {}))
r = subprocess.run(["psql", os.environ["SUPABASE_DB_URL"], "-v", "ON_ERROR_STOP=1", "-q", "-f", path], capture_output=True, text=True)
print(r.stdout[-3000:]); print(r.stderr[-3000:])
