# mrp/seed.py
"""
Seed realistic MRP master data: materials, stock, and requirements.
Run: python -m mrp.seed
"""
import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.database import SessionLocal, engine
from api import models

models.Base.metadata.create_all(bind=engine)

MATERIALS = [
    # (number, description, mrp_type, lot_sizing, lead_time, safety_stock, reorder_point,
    #  min_qty, max_qty, fixed_lot, max_stock, unit_price, ordering_cost, annual_demand, uom)
    ("1000-CPU",  "Intel Core i7 Processor",       "PD", "EQ",  21, 100,  0,   50,  None,  None, None,  320.0,  75.0, 4800, "EA"),
    ("1010-RAM",  "DDR5 16GB Memory Module",        "PD", "FX",  14, 200,  0,  128,  None, 128.0, None,   85.0,  40.0, 9600, "EA"),
    ("1020-SSD",  "NVMe SSD 512GB",                "PD", "EX",  10,  50,  0,   10,  None,  None, None,   65.0,  30.0, 3600, "EA"),
    ("1030-MBA",  "Mainboard Assembly",             "PD", "EX",   3,  20,  0,    5,  None,  None, None,  180.0,  60.0, 1200, "EA"),
    ("2000-DISP", "15.6-inch FHD Display Panel",   "VB", "HB",  28,  30, 80,   10,  None,  None,  500,   48.0,  55.0, 2400, "EA"),
    ("2010-BATT", "Li-Ion Battery Pack 4800mAh",   "VM", "EQ",  21,  50,  0,   25,  None,  None, None,   22.0,  35.0, 3000, "EA"),
    ("3000-PKG",  "Retail Packaging Box (laptop)",  "PD", "FX",   5, 500,  0,  200,  None, 500.0, None,    3.5,  20.0,12000, "EA"),
    ("4000-WRAP", "Anti-static Wrap Sheet",         "ND", "EX",   3,   0,  0,    1,  None,  None, None,    0.2,  10.0,    0, "SH"),
    ("5000-FAN",  "CPU Cooling Fan Assembly",       "PD", "EX",  14,  30,  0,   10,   200,  None, None,   12.0,  25.0, 1440, "EA"),
    ("6000-CHG",  "65W USB-C Power Adapter",        "VB", "FX",  18,  40, 60,   50,  None,  50.0, None,   28.0,  45.0, 2400, "EA"),
    ("FG-LAPTOP", "Laptop Pro Assembly",            "PD", "EX",   2,   5,  0,    1,  None,  None, None,  899.0, 100.0, 1200, "EA"),
]

STOCK = {
    "1000-CPU":  250.0,
    "1010-RAM":  340.0,
    "1020-SSD":   85.0,
    "1030-MBA":   15.0,  # low — will need orders
    "2000-DISP":  90.0,  # above ROP (80) — no trigger
    "2010-BATT":  45.0,  # BELOW safety stock (50) — triggers EX50
    "3000-PKG":  800.0,
    "4000-WRAP": 10000.0,
    "5000-FAN":   28.0,  # below safety (30)
    "6000-CHG":   55.0,  # below ROP (60) — triggers reorder
    "FG-LAPTOP":   0.0,  # no finished stock — must build
}


def seed():
    db = SessionLocal()
    today = datetime.utcnow()

    # Clear existing MRP data
    for tbl in (
        models.ExceptionMessage, models.PlannedOrder, models.MRPLog,
        models.MRPRun, models.Requirement, models.MaterialStock, models.Material,
    ):
        db.query(tbl).delete()
    db.commit()

    mat_map = {}
    for row in MATERIALS:
        (num, desc, mrp_type, lot_key, lt, ss, rop, min_q, max_q,
         fixed, max_s, price, ord_cost, annual, uom) = row
        m = models.Material(
            number=num,
            description=desc,
            mrp_type=models.MRPType(mrp_type),
            lot_sizing_key=models.LotSizingKey(lot_key),
            lead_time_days=lt,
            safety_stock=float(ss),
            reorder_point=float(rop),
            min_order_qty=float(min_q),
            max_order_qty=float(max_q) if max_q else None,
            fixed_lot_size=float(fixed) if fixed else None,
            max_stock_level=float(max_s) if max_s else None,
            unit_price=price,
            ordering_cost=ord_cost,
            annual_demand_est=float(annual) if annual else None,
            unit_of_measure=uom,
        )
        db.add(m)
        db.flush()
        mat_map[num] = m.id

        s = models.MaterialStock(material_id=m.id, quantity_on_hand=STOCK.get(num, 0.0))
        db.add(s)

    db.commit()

    # Add requirements: mix of urgent (near-term) and future, and one past-due
    reqs = [
        # (material_number, quantity, days_from_today, source)
        ("1000-CPU",   500, +10, "SALES_ORDER"),   # needs 500 in 10d, have 250, safety=100 -> net 350
        ("1000-CPU",   300, +30, "FORECAST"),       # covered by planned order surplus
        ("1010-RAM",  1024, +14, "SALES_ORDER"),   # fixed lot 128; needs 1024, have 340, safety=200
        ("1020-SSD",   200,  +7, "SALES_ORDER"),   # lead 10d, req in 7d -> start date in past (EX02)
        ("1030-MBA",    50, +20, "SALES_ORDER"),   # low stock (15), safety=20 -> net 55
        ("1030-MBA",    30, +35, "SALES_ORDER"),   # second req for same material
        ("3000-PKG",  3000, +45, "FORECAST"),      # large forecast, fixed lot 500
        ("5000-FAN",   150, +21, "SALES_ORDER"),   # need 150, have 28, safety=30 -> net=152
        ("1000-CPU",   200,  -5, "SALES_ORDER"),   # PAST-DUE requirement (triggers EX07)
        ("FG-LAPTOP",   50, +14, "SALES_ORDER"),   # 50 laptops in 14 days -> BOM explosion
        ("FG-LAPTOP",   30, +28, "FORECAST"),       # 30 more in 28 days
    ]

    for (num, qty, days, source) in reqs:
        if num not in mat_map:
            continue
        r = models.Requirement(
            material_id=mat_map[num],
            quantity=float(qty),
            requirement_date=today + timedelta(days=days),
            source=source,
        )
        db.add(r)

    db.commit()

    # ── BOM: Laptop Pro Assembly ───────────────────────────────────────────────
    BOM = [
        # (parent_number, component_number, qty_per)
        ("FG-LAPTOP", "1000-CPU",  1.0),
        ("FG-LAPTOP", "1010-RAM",  2.0),   # 32 GB = 2 × 16 GB modules
        ("FG-LAPTOP", "1020-SSD",  1.0),
        ("FG-LAPTOP", "1030-MBA",  1.0),
        ("FG-LAPTOP", "2000-DISP", 1.0),
        ("FG-LAPTOP", "2010-BATT", 1.0),
        ("FG-LAPTOP", "5000-FAN",  1.0),
        ("FG-LAPTOP", "3000-PKG",  1.0),
        ("FG-LAPTOP", "4000-WRAP", 2.0),   # 2 anti-static sheets per unit
    ]

    db.query(models.BOMItem).delete()
    db.commit()

    for (parent_num, comp_num, qty_per) in BOM:
        if parent_num not in mat_map or comp_num not in mat_map:
            continue
        db.add(models.BOMItem(
            parent_material_id=mat_map[parent_num],
            component_material_id=mat_map[comp_num],
            quantity_per=qty_per,
        ))

    db.commit()
    print(f"Seeded {len(MATERIALS)} materials, {len(STOCK)} stock records, {len(reqs)} requirements, {len(BOM)} BOM items")
    db.close()


if __name__ == "__main__":
    seed()
