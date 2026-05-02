-- ============================================================
-- CRM + ERP SYSTEM — MySQL Database Schema
-- Engine: InnoDB | Charset: utf8mb4 | Collation: utf8mb4_unicode_ci
-- ============================================================

CREATE DATABASE IF NOT EXISTS crm_erp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE crm_erp;

-- ────────────────────────────────────────────────────────────
-- 1. BRANCHES
-- ────────────────────────────────────────────────────────────
CREATE TABLE branches (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(150)  NOT NULL,
    address       TEXT,
    city          VARCHAR(100),
    state         VARCHAR(100),
    pincode       VARCHAR(10),
    phone         VARCHAR(20),
    email         VARCHAR(150),
    is_active     TINYINT(1)   NOT NULL DEFAULT 1,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ────────────────────────────────────────────────────────────
-- 2. USERS (staff + admin)
-- ────────────────────────────────────────────────────────────
CREATE TABLE users (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    branch_id     INT UNSIGNED,
    username      VARCHAR(150) NOT NULL UNIQUE,
    email         VARCHAR(254) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name    VARCHAR(100),
    last_name     VARCHAR(100),
    phone         VARCHAR(20),
    role          ENUM('super_admin','staff') NOT NULL DEFAULT 'staff',
    is_active     TINYINT(1)  NOT NULL DEFAULT 1,
    last_login    DATETIME,
    created_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ────────────────────────────────────────────────────────────
-- 3. USER TARGETS (set by super admin per user per month)
-- ────────────────────────────────────────────────────────────
CREATE TABLE user_targets (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id       INT UNSIGNED NOT NULL,
    month         TINYINT UNSIGNED NOT NULL COMMENT '1–12',
    year          SMALLINT UNSIGNED NOT NULL,
    lead_target   INT UNSIGNED DEFAULT 0,
    walkin_target INT UNSIGNED DEFAULT 0,
    enroll_target INT UNSIGNED DEFAULT 0,
    revenue_target DECIMAL(12,2) DEFAULT 0.00,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_user_month_year (user_id, month, year),
    CONSTRAINT fk_target_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ────────────────────────────────────────────────────────────
-- 4. COURSES
-- ────────────────────────────────────────────────────────────
CREATE TABLE courses (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(200)   NOT NULL,
    description     TEXT,
    duration_months TINYINT UNSIGNED,
    actual_fees     DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
    discount_amount DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
    final_fees      DECIMAL(10,2)  GENERATED ALWAYS AS (actual_fees - discount_amount) STORED,
    is_active       TINYINT(1)     NOT NULL DEFAULT 1,
    created_by      INT UNSIGNED,
    created_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_course_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ────────────────────────────────────────────────────────────
-- 5. LEADS
-- ────────────────────────────────────────────────────────────
CREATE TABLE leads (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    lead_number   VARCHAR(20)  NOT NULL UNIQUE COMMENT 'Auto: LD-YYYYMM-XXXX',
    assigned_to   INT UNSIGNED,
    branch_id     INT UNSIGNED,
    course_id     INT UNSIGNED,
    name          VARCHAR(200) NOT NULL,
    phone         VARCHAR(20)  NOT NULL,
    location      VARCHAR(200),
    walkin_date   DATE,
    remarks       TEXT,
    status        ENUM('new','follow_up','walk_in','converted','lost') NOT NULL DEFAULT 'new',
    source        ENUM('walk_in','online','referral','social_media','advertisement','other') DEFAULT 'other',
    created_by    INT UNSIGNED,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_lead_user    FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_lead_branch  FOREIGN KEY (branch_id)   REFERENCES branches(id) ON DELETE SET NULL,
    CONSTRAINT fk_lead_course  FOREIGN KEY (course_id)   REFERENCES courses(id)  ON DELETE SET NULL,
    CONSTRAINT fk_lead_creator FOREIGN KEY (created_by)  REFERENCES users(id)    ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE INDEX idx_leads_status   ON leads(status);
CREATE INDEX idx_leads_branch   ON leads(branch_id);
CREATE INDEX idx_leads_assigned ON leads(assigned_to);
CREATE INDEX idx_leads_walkin   ON leads(walkin_date);

-- ────────────────────────────────────────────────────────────
-- 6. WALK-INS (candidate visits)
-- ────────────────────────────────────────────────────────────
CREATE TABLE walkins (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    candidate_number VARCHAR(20)   NOT NULL UNIQUE COMMENT 'Auto: WI-YYYYMM-XXXX',
    lead_id          INT UNSIGNED,
    branch_id        INT UNSIGNED,
    assigned_to      INT UNSIGNED,
    course_id        INT UNSIGNED,

    -- Personal info
    name             VARCHAR(200)  NOT NULL,
    dob              DATE,
    phone            VARCHAR(20)   NOT NULL,
    email            VARCHAR(254),
    location         VARCHAR(200),
    pincode          VARCHAR(10),

    -- Academic / Professional
    qualification    VARCHAR(200),
    profession       VARCHAR(200),
    year_of_passing  YEAR,
    college_company  VARCHAR(300),

    -- Visit info
    demo_class       TINYINT(1)    NOT NULL DEFAULT 0,
    source           ENUM('walk_in','online','referral','social_media','advertisement','whatsapp','other') DEFAULT 'walk_in',
    remarks          TEXT,

    -- Status
    status           ENUM('new','follow_up','converted','not_interested') NOT NULL DEFAULT 'new',
    visit_date       DATE          NOT NULL DEFAULT (CURRENT_DATE),

    created_by       INT UNSIGNED,
    created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_wi_lead    FOREIGN KEY (lead_id)     REFERENCES leads(id)    ON DELETE SET NULL,
    CONSTRAINT fk_wi_branch  FOREIGN KEY (branch_id)   REFERENCES branches(id) ON DELETE SET NULL,
    CONSTRAINT fk_wi_user    FOREIGN KEY (assigned_to) REFERENCES users(id)    ON DELETE SET NULL,
    CONSTRAINT fk_wi_course  FOREIGN KEY (course_id)   REFERENCES courses(id)  ON DELETE SET NULL,
    CONSTRAINT fk_wi_creator FOREIGN KEY (created_by)  REFERENCES users(id)    ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE INDEX idx_walkins_status  ON walkins(status);
CREATE INDEX idx_walkins_branch  ON walkins(branch_id);
CREATE INDEX idx_walkins_date    ON walkins(visit_date);

-- ────────────────────────────────────────────────────────────
-- 7. ENROLLMENTS (students)
-- ────────────────────────────────────────────────────────────
CREATE TABLE enrollments (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    student_number   VARCHAR(20)   NOT NULL UNIQUE COMMENT 'Auto: STU-YYYYMM-XXXX',
    walkin_id        INT UNSIGNED,
    lead_id          INT UNSIGNED,
    branch_id        INT UNSIGNED,
    course_id        INT UNSIGNED  NOT NULL,
    enrolled_by      INT UNSIGNED,

    -- Personal info
    name             VARCHAR(200)  NOT NULL,
    dob              DATE,
    phone            VARCHAR(20)   NOT NULL,
    email            VARCHAR(254),

    -- Fee info
    actual_fees      DECIMAL(10,2) NOT NULL,
    discount_amount  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    discount_reason  VARCHAR(300),
    final_fees       DECIMAL(10,2) NOT NULL,

    -- Dates
    start_date       DATE,
    enrollment_date  DATE          NOT NULL DEFAULT (CURRENT_DATE),

    -- Status
    status           ENUM('active','completed','dropped','on_hold') NOT NULL DEFAULT 'active',

    created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_enroll_walkin  FOREIGN KEY (walkin_id)  REFERENCES walkins(id)  ON DELETE SET NULL,
    CONSTRAINT fk_enroll_lead    FOREIGN KEY (lead_id)    REFERENCES leads(id)    ON DELETE SET NULL,
    CONSTRAINT fk_enroll_branch  FOREIGN KEY (branch_id)  REFERENCES branches(id) ON DELETE SET NULL,
    CONSTRAINT fk_enroll_course  FOREIGN KEY (course_id)  REFERENCES courses(id)  ON DELETE RESTRICT,
    CONSTRAINT fk_enroll_staff   FOREIGN KEY (enrolled_by) REFERENCES users(id)   ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE INDEX idx_enroll_branch  ON enrollments(branch_id);
CREATE INDEX idx_enroll_course  ON enrollments(course_id);
CREATE INDEX idx_enroll_status  ON enrollments(status);

-- ────────────────────────────────────────────────────────────
-- 8. PAYMENTS
-- ────────────────────────────────────────────────────────────
CREATE TABLE payments (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    enrollment_id    INT UNSIGNED  NOT NULL,
    total_fees       DECIMAL(10,2) NOT NULL,
    paid_amount      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    balance          DECIMAL(10,2) GENERATED ALWAYS AS (total_fees - paid_amount) STORED,
    status           ENUM('paid','unpaid','partial') NOT NULL DEFAULT 'unpaid',
    updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_payment_enroll FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE,
    UNIQUE KEY uq_payment_enroll (enrollment_id)
) ENGINE=InnoDB;

-- ────────────────────────────────────────────────────────────
-- 9. PAYMENT INSTALLMENTS
-- ────────────────────────────────────────────────────────────
CREATE TABLE payment_installments (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    payment_id       INT UNSIGNED  NOT NULL,
    enrollment_id    INT UNSIGNED  NOT NULL,
    amount           DECIMAL(10,2) NOT NULL,
    payment_mode     ENUM('cash','upi','bank_transfer','cheque','card','other') NOT NULL DEFAULT 'cash',
    reference_number VARCHAR(100),
    notes            TEXT,
    collected_by     INT UNSIGNED,
    payment_date     DATE          NOT NULL DEFAULT (CURRENT_DATE),
    created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_inst_payment  FOREIGN KEY (payment_id)    REFERENCES payments(id)    ON DELETE CASCADE,
    CONSTRAINT fk_inst_enroll   FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE,
    CONSTRAINT fk_inst_staff    FOREIGN KEY (collected_by)  REFERENCES users(id)       ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE INDEX idx_installments_date ON payment_installments(payment_date);

-- ────────────────────────────────────────────────────────────
-- 10. WHATSAPP MESSAGES LOG
-- ────────────────────────────────────────────────────────────
CREATE TABLE whatsapp_messages (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    recipient_phone  VARCHAR(20)   NOT NULL,
    template_name    VARCHAR(100),
    message_body     TEXT          NOT NULL,
    message_type     ENUM('fee_reminder','birthday','first_class','walkin_reminder','follow_up','manual') NOT NULL,
    status           ENUM('pending','sent','delivered','read','failed') NOT NULL DEFAULT 'pending',
    wa_message_id    VARCHAR(100) COMMENT 'WhatsApp Cloud API message id',
    error_message    TEXT,
    sent_by          INT UNSIGNED,
    related_model    VARCHAR(50)  COMMENT 'enrollment / lead / walkin',
    related_id       INT UNSIGNED,
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at          DATETIME,
    CONSTRAINT fk_wa_user FOREIGN KEY (sent_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE INDEX idx_wa_phone  ON whatsapp_messages(recipient_phone);
CREATE INDEX idx_wa_status ON whatsapp_messages(status);

-- ────────────────────────────────────────────────────────────
-- 11. NOTIFICATIONS (in-app)
-- ────────────────────────────────────────────────────────────
CREATE TABLE notifications (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED  NOT NULL,
    title       VARCHAR(200)  NOT NULL,
    message     TEXT          NOT NULL,
    type        ENUM('info','success','warning','error') NOT NULL DEFAULT 'info',
    is_read     TINYINT(1)    NOT NULL DEFAULT 0,
    related_url VARCHAR(300),
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_notif_user_unread ON notifications(user_id, is_read);

-- ────────────────────────────────────────────────────────────
-- 12. AUDIT LOG
-- ────────────────────────────────────────────────────────────
CREATE TABLE audit_logs (
    id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id      INT UNSIGNED,
    action       VARCHAR(100)  NOT NULL COMMENT 'created / updated / deleted',
    model_name   VARCHAR(100)  NOT NULL,
    object_id    INT UNSIGNED,
    changes      JSON          COMMENT 'before/after diff',
    ip_address   VARCHAR(45),
    created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE INDEX idx_audit_model ON audit_logs(model_name, object_id);
