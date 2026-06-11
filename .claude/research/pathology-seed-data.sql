-- ========================================================
-- COREONE 病理科种子数据
-- 用途: 初始化物料分类、物料主数据、检测项目、BOM清单
-- 版本: 1.0
-- 创建日期: 2026-06-01
-- 注意: 此脚本假设数据库已存在（由 DatabaseManager.ts 初始化）
--       运行前请确保表结构已创建
-- ========================================================

BEGIN TRANSACTION;

-- ========================================================
-- 第一部分：物料分类（三级分类体系）
-- ========================================================

-- 一级分类：试剂类
INSERT OR IGNORE INTO material_categories (id, code, name, level, sort_order, status, created_at, updated_at) VALUES
('CAT-R', 'R', '试剂类', 1, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-C', 'C', '耗材类', 1, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-Q', 'Q', '质控品类', 1, 3, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-D', 'D', '设备配件类', 1, 4, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 二级分类：试剂类
INSERT OR IGNORE INTO material_categories (id, code, name, parent_id, level, sort_order, status, created_at, updated_at) VALUES
('CAT-R01', 'R01', '常规染色试剂', 'CAT-R', 2, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-R02', 'R02', '免疫组化试剂', 'CAT-R', 2, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-R03', 'R03', '特殊染色试剂', 'CAT-R', 2, 3, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-R04', 'R04', '分子病理试剂', 'CAT-R', 2, 4, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-R05', 'R05', '细胞学试剂', 'CAT-R', 2, 5, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-R06', 'R06', '通用试剂', 'CAT-R', 2, 6, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-R07', 'R07', '标本处理试剂', 'CAT-R', 2, 7, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 二级分类：耗材类
INSERT OR IGNORE INTO material_categories (id, code, name, parent_id, level, sort_order, status, created_at, updated_at) VALUES
('CAT-C01', 'C01', '玻片类', 'CAT-C', 2, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-C02', 'C02', '包埋类', 'CAT-C', 2, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-C03', 'C03', '切片类', 'CAT-C', 2, 3, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-C04', 'C04', '移液离心类', 'CAT-C', 2, 4, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-C05', 'C05', '防护用品', 'CAT-C', 2, 5, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-C06', 'C06', '标签存储', 'CAT-C', 2, 6, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-C07', 'C07', '染色器具', 'CAT-C', 2, 7, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 二级分类：质控品
INSERT OR IGNORE INTO material_categories (id, code, name, parent_id, level, sort_order, status, created_at, updated_at) VALUES
('CAT-Q01', 'Q01', '阳性质控', 'CAT-Q', 2, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-Q02', 'Q02', '阴性质控', 'CAT-Q', 2, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 二级分类：设备配件
INSERT OR IGNORE INTO material_categories (id, code, name, parent_id, level, sort_order, status, created_at, updated_at) VALUES
('CAT-D01', 'D01', '染色机配件', 'CAT-D', 2, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-D02', 'D02', '切片机配件', 'CAT-D', 2, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-D03', 'D03', '封片机配件', 'CAT-D', 2, 3, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 三级分类：常规染色试剂
INSERT OR IGNORE INTO material_categories (id, code, name, parent_id, level, sort_order, status, created_at, updated_at) VALUES
('CAT-R01-01', 'R01-01', '苏木素染液', 'CAT-R01', 3, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-R01-02', 'R01-02', '伊红染液', 'CAT-R01', 3, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-R01-03', 'R01-03', '分化液', 'CAT-R01', 3, 3, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-R01-04', 'R01-04', '返蓝液', 'CAT-R01', 3, 4, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 三级分类：免疫组化试剂
INSERT OR IGNORE INTO material_categories (id, code, name, parent_id, level, sort_order, status, created_at, updated_at) VALUES
('CAT-R02-01', 'R02-01', '一抗', 'CAT-R02', 3, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-R02-02', 'R02-02', '二抗', 'CAT-R02', 3, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-R02-03', 'R02-03', '显色系统', 'CAT-R02', 3, 3, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-R02-04', 'R02-04', '抗原修复液', 'CAT-R02', 3, 4, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-R02-05', 'R02-05', '抗体稀释液', 'CAT-R02', 3, 5, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-R02-06', 'R02-06', '阻断剂', 'CAT-R02', 3, 6, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 三级分类：特殊染色试剂
INSERT OR IGNORE INTO material_categories (id, code, name, parent_id, level, sort_order, status, created_at, updated_at) VALUES
('CAT-R03-01', 'R03-01', 'Masson三色染色液', 'CAT-R03', 3, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-R03-02', 'R03-02', 'PAS染色液', 'CAT-R03', 3, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-R03-03', 'R03-03', '抗酸染色液', 'CAT-R03', 3, 3, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-R03-04', 'R03-04', '刚果红染液', 'CAT-R03', 3, 4, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-R03-05', 'R03-05', '网织纤维染色液', 'CAT-R03', 3, 5, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 三级分类：通用试剂
INSERT OR IGNORE INTO material_categories (id, code, name, parent_id, level, sort_order, status, created_at, updated_at) VALUES
('CAT-R06-01', 'R06-01', 'PBS缓冲液', 'CAT-R06', 3, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-R06-02', 'R06-02', 'DAB显色液', 'CAT-R06', 3, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-R06-03', 'R06-03', '乙醇', 'CAT-R06', 3, 3, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-R06-04', 'R06-04', '二甲苯', 'CAT-R06', 3, 4, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-R06-05', 'R06-05', '中性树胶', 'CAT-R06', 3, 5, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 三级分类：标本处理试剂
INSERT OR IGNORE INTO material_categories (id, code, name, parent_id, level, sort_order, status, created_at, updated_at) VALUES
('CAT-R07-01', 'R07-01', '福尔马林固定液', 'CAT-R07', 3, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-R07-02', 'R07-02', '脱水液', 'CAT-R07', 3, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 三级分类：玻片类
INSERT OR IGNORE INTO material_categories (id, code, name, parent_id, level, sort_order, status, created_at, updated_at) VALUES
('CAT-C01-01', 'C01-01', '载玻片', 'CAT-C01', 3, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-C01-02', 'C01-02', '盖玻片', 'CAT-C01', 3, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-C01-03', 'C01-03', '防脱载玻片', 'CAT-C01', 3, 3, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 三级分类：包埋类
INSERT OR IGNORE INTO material_categories (id, code, name, parent_id, level, sort_order, status, created_at, updated_at) VALUES
('CAT-C02-01', 'C02-01', '包埋盒', 'CAT-C02', 3, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-C02-02', 'C02-02', '石蜡', 'CAT-C02', 3, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-C02-03', 'C02-03', 'OCT包埋剂', 'CAT-C02', 3, 3, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 三级分类：切片类
INSERT OR IGNORE INTO material_categories (id, code, name, parent_id, level, sort_order, status, created_at, updated_at) VALUES
('CAT-C03-01', 'C03-01', '病理刀片', 'CAT-C03', 3, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('CAT-C03-02', 'C03-02', '刀架', 'CAT-C03', 3, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- ========================================================
-- 第二部分：物料主数据（代表性物料）
-- ========================================================

INSERT OR IGNORE INTO materials (id, code, name, spec, unit, category_id, price, min_stock, max_stock, safety_stock, status, created_at, updated_at) VALUES
-- 常规染色试剂
('MAT-R01-01-001', 'R0101001', '苏木素染液', '500ml/瓶', '瓶', 'CAT-R01-01', 120.00, 2, 20, 3, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R01-01-002', 'R0101002', '苏木素染液', '1L/瓶', '瓶', 'CAT-R01-01', 200.00, 2, 15, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R01-02-001', 'R0102001', '伊红染液(醇溶性)', '500ml/瓶', '瓶', 'CAT-R01-02', 80.00, 2, 20, 3, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R01-03-001', 'R0103001', '分化液(盐酸乙醇)', '500ml/瓶', '瓶', 'CAT-R01-03', 45.00, 2, 15, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R01-04-001', 'R0104001', '返蓝液(氨水)', '500ml/瓶', '瓶', 'CAT-R01-04', 40.00, 2, 15, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

-- 免疫组化一抗（品牌池示例）
('MAT-R02-01-001', 'R0201001', 'ER抗体(Dako)', '1ml/支, 克隆号:1D5', '支', 'CAT-R02-01', 850.00, 1, 10, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R02-01-002', 'R0201002', 'ER抗体(迈新)', '1ml/支, 克隆号:SP1', '支', 'CAT-R02-01', 680.00, 1, 10, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R02-01-003', 'R0201003', 'PR抗体(Dako)', '1ml/支, 克隆号:PgR636', '支', 'CAT-R02-01', 850.00, 1, 10, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R02-01-004', 'R0201004', 'HER2抗体(Dako)', '1ml/支, 克隆号:4B5', '支', 'CAT-R02-01', 950.00, 1, 10, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R02-01-005', 'R0201005', 'Ki-67抗体(Dako)', '1ml/支, 克隆号:MIB-1', '支', 'CAT-R02-01', 820.00, 1, 10, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R02-01-006', 'R0201006', 'Ki-67抗体(迈新)', '1ml/支, 克隆号:UMAB107', '支', 'CAT-R02-01', 650.00, 1, 10, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R02-01-007', 'R0201007', 'TTF-1抗体', '1ml/支, 克隆号:8G7G3/1', '支', 'CAT-R02-01', 880.00, 1, 10, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R02-01-008', 'R0201008', 'NapsinA抗体', '1ml/支, 克隆号:IP64', '支', 'CAT-R02-01', 920.00, 1, 10, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R02-01-009', 'R0201009', 'p40抗体', '1ml/支, 克隆号:BC28', '支', 'CAT-R02-01', 860.00, 1, 10, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R02-01-010', 'R0201010', 'CK7抗体', '1ml/支, 克隆号:OV-TL12/30', '支', 'CAT-R02-01', 780.00, 1, 10, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R02-01-011', 'R0201011', 'CD20抗体', '1ml/支, 克隆号:L26', '支', 'CAT-R02-01', 790.00, 1, 10, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R02-01-012', 'R0201012', 'CD3抗体', '1ml/支, 克隆号:PS1', '支', 'CAT-R02-01', 780.00, 1, 10, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R02-01-013', 'R0201013', 'CD117抗体', '1ml/支, 克隆号:9.7', '支', 'CAT-R02-01', 900.00, 1, 10, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R02-01-014', 'R0201014', 'DOG1抗体', '1ml/支, 克隆号:K9', '支', 'CAT-R02-01', 950.00, 1, 10, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R02-01-015', 'R0201015', 'MLH1抗体', '1ml/支, 克隆号:G168-15', '支', 'CAT-R02-01', 880.00, 1, 10, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R02-01-016', 'R0201016', 'PMS2抗体', '1ml/支, 克隆号:A16-4', '支', 'CAT-R02-01', 880.00, 1, 10, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R02-01-017', 'R0201017', 'PD-L1抗体', '1ml/支, 克隆号:22C3', '支', 'CAT-R02-01', 1200.00, 1, 5, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R02-01-018', 'R0201018', 'ALK抗体(D5F3)', '1ml/支, 克隆号:D5F3', '支', 'CAT-R02-01', 1100.00, 1, 5, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R02-01-019', 'R0201019', '广谱CK(CKpan)', '1ml/支, 克隆号:AE1/AE3', '支', 'CAT-R02-01', 750.00, 1, 10, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R02-01-020', 'R0201020', 'Vimentin抗体', '1ml/支, 克隆号:V9', '支', 'CAT-R02-01', 720.00, 1, 10, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

-- 免疫组化二抗/显色系统
('MAT-R02-02-001', 'R0202001', 'HRP标记兔/鼠二抗', '3ml/支', '支', 'CAT-R02-02', 450.00, 2, 15, 3, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R02-03-001', 'R0203001', 'DAB显色试剂盒', '6ml/套', '套', 'CAT-R02-03', 380.00, 2, 15, 3, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R02-04-001', 'R0204001', 'EDTA抗原修复液(pH9.0)', '500ml/瓶', '瓶', 'CAT-R02-04', 150.00, 2, 15, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R02-04-002', 'R0204002', '柠檬酸盐抗原修复液(pH6.0)', '500ml/瓶', '瓶', 'CAT-R02-04', 140.00, 2, 15, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R02-05-001', 'R0205001', '抗体稀释液', '50ml/瓶', '瓶', 'CAT-R02-05', 120.00, 2, 15, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R02-06-001', 'R0206001', '内源性过氧化物酶阻断剂', '3ml/支', '支', 'CAT-R02-06', 180.00, 2, 15, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

-- 特殊染色试剂
('MAT-R03-01-001', 'R0301001', 'Masson三色染色液', '100ml/套', '套', 'CAT-R03-01', 280.00, 1, 10, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R03-02-001', 'R0302001', 'PAS染色液', '100ml/套', '套', 'CAT-R03-02', 220.00, 1, 10, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R03-03-001', 'R0303001', '抗酸染色液(Ziehl-Neelsen)', '100ml/套', '套', 'CAT-R03-03', 180.00, 1, 10, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R03-04-001', 'R0304001', '刚果红染液(Highman法)', '50ml/瓶', '瓶', 'CAT-R03-04', 200.00, 1, 10, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R03-05-001', 'R0305001', '网织纤维染色液(Gomori银染)', '100ml/套', '套', 'CAT-R03-05', 250.00, 1, 10, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

-- 通用试剂
('MAT-R06-01-001', 'R0601001', 'PBS缓冲液(10×)', '500ml/瓶', '瓶', 'CAT-R06-01', 35.00, 3, 30, 5, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R06-02-001', 'R0602001', 'DAB显色液', '6ml/支', '支', 'CAT-R06-02', 120.00, 3, 25, 5, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R06-03-001', 'R0603001', '无水乙醇', '500ml/瓶', '瓶', 'CAT-R06-03', 25.00, 5, 50, 10, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R06-03-002', 'R0603002', '95%乙醇', '500ml/瓶', '瓶', 'CAT-R06-03', 20.00, 5, 50, 10, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R06-04-001', 'R0604001', '二甲苯', '500ml/瓶', '瓶', 'CAT-R06-04', 30.00, 5, 50, 10, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R06-05-001', 'R0605001', '中性树胶', '100ml/瓶', '瓶', 'CAT-R06-05', 45.00, 3, 30, 5, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

-- 标本处理试剂
('MAT-R07-01-001', 'R0701001', '10%中性福尔马林固定液', '5L/桶', '桶', 'CAT-R07-01', 85.00, 3, 30, 5, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R07-01-002', 'R0701002', '10%中性福尔马林固定液', '10L/桶', '桶', 'CAT-R07-01', 150.00, 2, 20, 3, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-R07-02-001', 'R0702001', '梯度脱水液(75%-100%)', '5L/套', '套', 'CAT-R07-02', 120.00, 2, 20, 3, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

-- 玻片类
('MAT-C01-01-001', 'C0101001', '普通载玻片', '50片/盒', '盒', 'CAT-C01-01', 25.00, 5, 100, 10, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-C01-02-001', 'C0102001', '盖玻片(22×22mm)', '100片/盒', '盒', 'CAT-C01-02', 15.00, 5, 100, 10, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-C01-02-002', 'C0102002', '盖玻片(24×32mm)', '100片/盒', '盒', 'CAT-C01-02', 18.00, 5, 100, 10, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-C01-03-001', 'C0103001', '防脱载玻片(正电荷)', '50片/盒', '盒', 'CAT-C01-03', 85.00, 3, 50, 5, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-C01-03-002', 'C0103002', '防脱载玻片(多聚赖氨酸)', '50片/盒', '盒', 'CAT-C01-03', 95.00, 3, 50, 5, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

-- 包埋类
('MAT-C02-01-001', 'C0201001', '一次性包埋盒(条形)', '500个/包', '包', 'CAT-C02-01', 60.00, 3, 50, 5, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-C02-02-001', 'C0202001', '切片石蜡(56-58℃)', '5kg/箱', '箱', 'CAT-C02-02', 180.00, 2, 20, 3, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-C02-03-001', 'C0203001', 'OCT包埋剂', '118ml/瓶', '瓶', 'CAT-C02-03', 220.00, 2, 15, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

-- 切片类
('MAT-C03-01-001', 'C0301001', '一次性病理刀片(羽毛牌)', '50片/盒', '盒', 'CAT-C03-01', 350.00, 3, 30, 5, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-C03-01-002', 'C0301002', '一次性病理刀片(通用型)', '50片/盒', '盒', 'CAT-C03-01', 180.00, 3, 30, 5, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

-- 防护用品
('MAT-C05-001', 'C0500001', '一次性乳胶手套', '100只/盒', '盒', 'CAT-C05', 35.00, 10, 200, 20, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-C05-002', 'C0500002', '一次性丁腈手套', '100只/盒', '盒', 'CAT-C05', 45.00, 10, 200, 20, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-C05-003', 'C0500003', '一次性医用口罩', '50只/包', '包', 'CAT-C05', 25.00, 10, 200, 20, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

-- 质控品
('MAT-Q01-001', 'Q0100001', '组织阳性质控片(乳腺癌)', '10片/盒', '盒', 'CAT-Q01', 280.00, 1, 10, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('MAT-Q02-001', 'Q0200001', '组织阴性质控片', '10片/盒', '盒', 'CAT-Q02', 180.00, 1, 10, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- ========================================================
-- 第三部分：检测项目
-- ========================================================

INSERT OR IGNORE INTO projects (id, code, name, type, cycle, supportable_samples, manager, description, status, created_at, updated_at) VALUES
-- HE制片
('PRJ-HE-001', 'HE-001', '常规HE染色', 'he', '1天', NULL, '技术员', '石蜡切片常规苏木素-伊红染色，用于组织学基础诊断', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-HE-002', 'HE-002', '快速HE染色', 'he', '30分钟', NULL, '技术员', '术中冰冻切片快速HE染色，用于术中快速病理诊断', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-HE-003', 'HE-003', '细胞HE染色', 'he', '1小时', NULL, '技术员', '细胞学涂片/液基细胞学HE染色', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

-- 免疫组化 - 乳腺癌
('PRJ-IHC-BR-01', 'IHC-BR-01', '乳腺癌分子分型基础套餐', 'ihc', '2天', NULL, '病理医师', 'ER、PR、HER2、Ki-67四项标志物检测，用于乳腺癌分子分型（Luminal A/B、HER2+、三阴型）', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-IHC-BR-02', 'IHC-BR-02', '乳腺癌根治术套餐', 'ihc', '2天', NULL, '病理医师', '分子分型 + AR、CyclinD1、p53，用于根治术后全面评估', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-IHC-BR-03', 'IHC-BR-03', '乳腺浸润性导管癌vs小叶癌鉴别', 'ihc', '2天', NULL, '病理医师', 'E-Cad、p120、CK5/6、p63、34βE12、Ki-67，用于浸润性导管癌与小叶癌鉴别', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

-- 免疫组化 - 肺癌
('PRJ-IHC-LU-01', 'IHC-LU-01', '肺腺癌标志物套餐', 'ihc', '2天', NULL, '病理医师', 'TTF-1、NapsinA、CK7，用于肺腺癌诊断及鉴别', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-IHC-LU-02', 'IHC-LU-02', '肺鳞癌标志物套餐', 'ihc', '2天', NULL, '病理医师', 'p40、p63、CK5/6，用于肺鳞癌诊断及鉴别', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-IHC-LU-03', 'IHC-LU-03', '肺癌靶向治疗标志物套餐', 'ihc', '2天', NULL, '病理医师', 'ALK(D5F3)、PD-L1(22C3)，用于肺癌靶向/免疫治疗筛选', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-IHC-LU-04', 'IHC-LU-04', '小细胞肺癌标志物套餐', 'ihc', '2天', NULL, '病理医师', 'CD56、CgA、Syn、TTF-1、Ki-67，用于小细胞神经内分泌癌诊断', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

-- 免疫组化 - 胃肠道
('PRJ-IHC-GI-01', 'IHC-GI-01', '胃癌标志物套餐', 'ihc', '2天', NULL, '病理医师', 'CK7、CK20、CDX2、HER2、p53、Ki-67，用于胃癌诊断及分子分型', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-IHC-GI-02', 'IHC-GI-02', '胃肠道间质瘤(GIST)套餐', 'ihc', '2天', NULL, '病理医师', 'CD117、DOG1、CD34、PDGFRA，用于GIST诊断及靶向治疗筛选', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-IHC-GI-03', 'IHC-GI-03', '神经内分泌肿瘤(NEN)套餐', 'ihc', '2天', NULL, '病理医师', 'CK、CD56、Syn、CgA、Ki-67，用于胃肠胰神经内分泌肿瘤诊断及分级', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-IHC-GI-04', 'IHC-GI-04', 'MMR蛋白检测套餐', 'ihc', '2天', NULL, '病理医师', 'MLH1、PMS2、MSH2、MSH6，用于林奇综合征筛查及免疫治疗获益评估', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

-- 免疫组化 - 淋巴瘤
('PRJ-IHC-LY-01', 'IHC-LY-01', 'B细胞淋巴瘤套餐', 'ihc', '2天', NULL, '病理医师', 'CD20、CD79a、PAX5、BCL2、BCL6、CD10，用于B细胞淋巴瘤分型', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-IHC-LY-02', 'IHC-LY-02', 'T细胞淋巴瘤套餐', 'ihc', '2天', NULL, '病理医师', 'CD3、CD5、CD7、CD4、CD8、CD30，用于T细胞淋巴瘤分型', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-IHC-LY-03', 'IHC-LY-03', '霍奇金淋巴瘤套餐', 'ihc', '2天', NULL, '病理医师', 'CD30、CD15、PAX5、LCA、MUM1、Ki-67，用于霍奇金淋巴瘤诊断', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-IHC-LY-04', 'IHC-LY-04', 'Ki-67增殖指数检测', 'ihc', '1天', NULL, '病理医师', 'Ki-67单抗体检测，用于评估肿瘤细胞增殖活性', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

-- 免疫组化 - 软组织
('PRJ-IHC-ST-01', 'IHC-ST-01', '软组织肿瘤鉴别套餐', 'ihc', '2天', NULL, '病理医师', 'Vim、Desmin、SMA、S-100、CD34、CD31，用于软组织肿瘤来源鉴别', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-IHC-ST-02', 'IHC-ST-02', '血管源性肿瘤套餐', 'ihc', '2天', NULL, '病理医师', 'CD31、CD34、FLI-1、ERG，用于血管源性肿瘤诊断', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

-- 免疫组化 - 通用单抗
('PRJ-IHC-SP-01', 'IHC-SP-01', '广谱细胞角蛋白(CKpan)', 'ihc', '1天', NULL, '病理医师', 'AE1/AE3克隆，用于上皮来源肿瘤标记', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-IHC-SP-02', 'IHC-SP-02', 'Vimentin波形蛋白检测', 'ihc', '1天', NULL, '病理医师', 'V9克隆，用于间叶来源肿瘤标记', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-IHC-SP-03', 'IHC-SP-03', 'CD34血管内皮标记', 'ihc', '1天', NULL, '病理医师', 'Qbend-10克隆，用于血管源性肿瘤/间质评估', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-IHC-SP-04', 'IHC-SP-04', 'S-100蛋白检测', 'ihc', '1天', NULL, '病理医师', '用于神经/黑色素/树突细胞标记', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

-- 特殊染色
('PRJ-SS-001', 'SS-001', 'Masson三色染色', 'ss', '1天', NULL, '技术员', '显示胶原纤维（蓝）、肌纤维（红）、核（蓝黑），用于肝/肾纤维化评估', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-SS-002', 'SS-002', 'PAS染色', 'ss', '1天', NULL, '技术员', '显示糖原、真菌、基底膜，用于肾小球肾炎、真菌感染诊断', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-SS-003', 'SS-003', 'AB-PAS联染', 'ss', '1天', NULL, '技术员', '同时显示酸性黏液（蓝）和中性黏液（红），用于胃肠道黏液腺癌诊断', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-SS-004', 'SS-004', '抗酸染色', 'ss', '1天', NULL, '技术员', 'Ziehl-Neelsen法，显示结核杆菌、麻风杆菌等抗酸菌', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-SS-005', 'SS-005', '刚果红染色', 'ss', '1天', NULL, '技术员', 'Highman法，显示淀粉样物质沉积，需偏光镜确认苹果绿色双折光', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-SS-006', 'SS-006', '网状纤维染色', 'ss', '1天', NULL, '技术员', 'Gomori银染法，显示网状纤维，用于癌vs肉瘤鉴别、肝硬化评估', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-SS-007', 'SS-007', '弹力纤维染色', 'ss', '1天', NULL, '技术员', '显示血管壁弹力纤维，用于血管病变、肺癌侵犯评估', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-SS-008', 'SS-008', '铁染色(普鲁士蓝)', 'ss', '1天', NULL, '技术员', '显示含铁血黄素（三价铁），用于贫血分型、出血灶评估', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-SS-009', 'SS-009', 'GMS六胺银染色', 'ss', '1天', NULL, '技术员', '显示真菌、卡氏肺孢子菌，用于机会性感染诊断', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-SS-010', 'SS-010', 'Giemsa染色', 'ss', '1天', NULL, '技术员', '显示幽门螺杆菌、肥大细胞，用于胃炎、血液病诊断', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

-- 分子病理
('PRJ-MP-001', 'MP-001', 'HER2基因扩增检测(FISH)', 'mp', '3天', NULL, '病理医师', 'FISH法检测HER2基因扩增状态，指导曲妥珠单抗等抗HER2靶向治疗', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-MP-002', 'MP-002', 'ALK基因重排检测(FISH)', 'mp', '3天', NULL, '病理医师', 'FISH法检测ALK基因重排，筛选克唑替尼等ALK抑制剂获益人群', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-MP-003', 'MP-003', 'HPV DNA检测(PCR)', 'mp', '2天', NULL, '病理医师', 'PCR法检测高危型HPV DNA，用于宫颈癌筛查', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-MP-004', 'MP-004', 'EGFR基因突变检测', 'mp', '3天', NULL, '病理医师', 'PCR/测序法检测EGFR热点突变，指导肺癌EGFR-TKI治疗', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-MP-005', 'MP-005', 'KRAS基因突变检测', 'mp', '3天', NULL, '病理医师', 'PCR/测序法检测KRAS外显子2-4突变，预测EGFR靶向治疗耐药', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-MP-006', 'MP-006', 'BRAF V600E突变检测', 'mp', '3天', NULL, '病理医师', 'PCR/测序法检测BRAF V600E突变，用于黑色素瘤/结直肠癌靶向治疗', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-MP-007', 'MP-007', 'MSI微卫星不稳定性检测', 'mp', '3天', NULL, '病理医师', 'PCR法检测MSI状态，用于林奇综合征筛查及免疫治疗获益评估', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-MP-008', 'MP-008', '1p/19q杂合性缺失检测(FISH)', 'mp', '3天', NULL, '病理医师', 'FISH法检测1p/19q LOH，用于少突胶质细胞瘤分子分型', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

-- 细胞学
('PRJ-CY-001', 'CY-001', '液基薄层细胞学(TCT)', 'cyto', '1天', NULL, '技术员', '宫颈脱落细胞液基薄层制片+巴氏染色，用于宫颈癌筛查', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-CY-002', 'CY-002', '非妇科液基细胞学', 'cyto', '1天', NULL, '技术员', '胸腹水、尿液、痰液等液基细胞学检查，用于转移癌诊断', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-CY-003', 'CY-003', '细针穿刺细胞学(FNA)', 'cyto', '2小时', NULL, '技术员', '甲状腺、乳腺、淋巴结等细针穿刺细胞学快速诊断', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('PRJ-CY-004', 'CY-004', '宫颈细胞学+HPV联合筛查', 'cyto', '2天', NULL, '病理医师', 'TCT联合HPV DNA检测，提高宫颈癌筛查灵敏度', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- ========================================================
-- 第四部分：BOM清单（代表性BOM示例）
-- ========================================================

-- BOM: 常规HE染色
INSERT OR IGNORE INTO boms (id, code, name, version, type, service_id, description, supportable_samples, status, created_at, updated_at) VALUES
('BOM-HE-001', 'BOM-HE-001', '常规HE染色标准BOM', 'v1.0', 'standard', 'PRJ-HE-001', '石蜡切片常规HE染色所需物料清单', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- BOM物料明细：HE染色（特异性试剂）
INSERT OR IGNORE INTO bom_items (id, bom_id, material_id, usage_per_sample, unit, sort_order, group_name) VALUES
('BI-HE-001-01', 'BOM-HE-001', 'MAT-R01-01-001', 0.5, 'ml', 1, NULL),
('BI-HE-001-02', 'BOM-HE-001', 'MAT-R01-02-001', 0.5, 'ml', 2, NULL),
('BI-HE-001-03', 'BOM-HE-001', 'MAT-R01-03-001', 0.3, 'ml', 3, NULL),
('BI-HE-001-04', 'BOM-HE-001', 'MAT-R01-04-001', 0.3, 'ml', 4, NULL);

-- BOM通用试剂配额：HE染色
INSERT OR IGNORE INTO bom_general_reagents (id, bom_id, material_id, usage_per_sample, unit, allocation_type, sort_order) VALUES
('BGR-HE-001-01', 'BOM-HE-001', 'MAT-R06-03-002', 2.0, 'ml', 'per_slide', 1),
('BGR-HE-001-02', 'BOM-HE-001', 'MAT-R06-03-001', 2.0, 'ml', 'per_slide', 2),
('BGR-HE-001-03', 'BOM-HE-001', 'MAT-R06-04-001', 3.0, 'ml', 'per_slide', 3),
('BGR-HE-001-04', 'BOM-HE-001', 'MAT-R06-05-001', 0.1, 'ml', 'per_slide', 4);

-- BOM通用耗材配额：HE染色
INSERT OR IGNORE INTO bom_general_consumables (id, bom_id, material_id, usage_per_sample, unit, allocation_type, sort_order) VALUES
('BGC-HE-001-01', 'BOM-HE-001', 'MAT-C01-01-001', 1.0, '片', 'per_slide', 1),
('BGC-HE-001-02', 'BOM-HE-001', 'MAT-C01-02-001', 1.0, '片', 'per_slide', 2);

-- BOM: 乳腺癌分子分型基础套餐
INSERT OR IGNORE INTO boms (id, code, name, version, type, service_id, description, supportable_samples, status, created_at, updated_at) VALUES
('BOM-IHC-BR-01', 'BOM-IHC-BR-01', '乳腺癌分子分型BOM', 'v1.0', 'standard', 'PRJ-IHC-BR-01', 'ER/PR/HER2/Ki-67四项标志物检测所需物料', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- BOM物料明细：乳腺癌分子分型（特异性试剂 - 品牌池示例）
INSERT OR IGNORE INTO bom_items (id, bom_id, material_id, usage_per_sample, unit, is_alternative, main_item_id, sort_order, group_name) VALUES
-- 激素受体组（ER + PR）
('BI-BR-01-01', 'BOM-IHC-BR-01', 'MAT-R02-01-001', 100.0, 'μl', 0, NULL, 1, '激素受体组'),
('BI-BR-01-01A', 'BOM-IHC-BR-01', 'MAT-R02-01-002', 100.0, 'μl', 1, 'BI-BR-01-01', 2, '激素受体组'),
('BI-BR-01-02', 'BOM-IHC-BR-01', 'MAT-R02-01-003', 100.0, 'μl', 0, NULL, 3, '激素受体组'),
-- 靶向标志物组（HER2）
('BI-BR-01-03', 'BOM-IHC-BR-01', 'MAT-R02-01-004', 100.0, 'μl', 0, NULL, 4, '靶向标志物组'),
-- 增殖指数组（Ki-67）
('BI-BR-01-04', 'BOM-IHC-BR-01', 'MAT-R02-01-005', 100.0, 'μl', 0, NULL, 5, '增殖指数组'),
('BI-BR-01-04A', 'BOM-IHC-BR-01', 'MAT-R02-01-006', 100.0, 'μl', 1, 'BI-BR-01-04', 6, '增殖指数组');

-- BOM通用试剂配额：乳腺癌分子分型
INSERT OR IGNORE INTO bom_general_reagents (id, bom_id, material_id, usage_per_sample, unit, allocation_type, sort_order) VALUES
('BGR-BR-01-01', 'BOM-IHC-BR-01', 'MAT-R06-01-001', 5.0, 'ml', 'per_slide', 1),
('BGR-BR-01-02', 'BOM-IHC-BR-01', 'MAT-R06-02-001', 0.3, 'ml', 'per_slide', 2),
('BGR-BR-01-03', 'BOM-IHC-BR-01', 'MAT-R02-04-001', 2.0, 'ml', 'per_slide', 3),
('BGR-BR-01-04', 'BOM-IHC-BR-01', 'MAT-R02-05-001', 1.0, 'ml', 'per_slide', 4),
('BGR-BR-01-05', 'BOM-IHC-BR-01', 'MAT-R02-06-001', 0.2, 'ml', 'per_slide', 5);

-- BOM通用耗材配额：乳腺癌分子分型
INSERT OR IGNORE INTO bom_general_consumables (id, bom_id, material_id, usage_per_sample, unit, allocation_type, sort_order) VALUES
('BGC-BR-01-01', 'BOM-IHC-BR-01', 'MAT-C01-03-001', 1.0, '片', 'per_slide', 1),
('BGC-BR-01-02', 'BOM-IHC-BR-01', 'MAT-C01-02-002', 1.0, '片', 'per_slide', 2);

-- BOM质控品配额：乳腺癌分子分型
INSERT OR IGNORE INTO bom_quality_controls (id, bom_id, material_id, usage_per_batch, unit, covers_samples, allocation_type, sort_order) VALUES
('BQC-BR-01-01', 'BOM-IHC-BR-01', 'MAT-Q01-001', 1.0, '片', 10, 'per_batch', 1),
('BQC-BR-01-02', 'BOM-IHC-BR-01', 'MAT-Q02-001', 1.0, '片', 10, 'per_batch', 2);

-- BOM: Masson三色染色
INSERT OR IGNORE INTO boms (id, code, name, version, type, service_id, description, supportable_samples, status, created_at, updated_at) VALUES
('BOM-SS-001', 'BOM-SS-001', 'Masson三色染色标准BOM', 'v1.0', 'standard', 'PRJ-SS-001', 'Masson三色染色所需物料清单', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- BOM物料明细：Masson三色
INSERT OR IGNORE INTO bom_items (id, bom_id, material_id, usage_per_sample, unit, sort_order, group_name) VALUES
('BI-SS-001-01', 'BOM-SS-001', 'MAT-R03-01-001', 3.0, 'ml', 1, NULL);

-- BOM通用试剂配额：Masson三色
INSERT OR IGNORE INTO bom_general_reagents (id, bom_id, material_id, usage_per_sample, unit, allocation_type, sort_order) VALUES
('BGR-SS-001-01', 'BOM-SS-001', 'MAT-R06-03-001', 5.0, 'ml', 'per_slide', 1),
('BGR-SS-001-02', 'BOM-SS-001', 'MAT-R06-04-001', 3.0, 'ml', 'per_slide', 2),
('BGR-SS-001-03', 'BOM-SS-001', 'MAT-R06-05-001', 0.1, 'ml', 'per_slide', 3);

-- BOM通用耗材配额：Masson三色
INSERT OR IGNORE INTO bom_general_consumables (id, bom_id, material_id, usage_per_sample, unit, allocation_type, sort_order) VALUES
('BGC-SS-001-01', 'BOM-SS-001', 'MAT-C01-01-001', 1.0, '片', 'per_slide', 1),
('BGC-SS-001-02', 'BOM-SS-001', 'MAT-C01-02-001', 1.0, '片', 'per_slide', 2);

COMMIT;
