CREATE TABLE IF NOT EXISTS users (
   id serial PRIMARY KEY,
   name VARCHAR(50) NOT NULL,
   email VARCHAR(50) NOT NULL UNIQUE CONSTRAINT chk_user_email CHECK (
      email ~* '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
   ),
   username VARCHAR(50) NOT NULL UNIQUE CONSTRAINT chk_user_username CHECK (username ~ '^[a-z][a-z0-9_]{0,49}$'),
   password_hash VARCHAR(100) NOT NULL,
   settings JSONB DEFAULT '{}'::JSONB,
   joined_at TIMESTAMP(0) DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_sessions (
   id serial PRIMARY KEY,
   user_id INTEGER NOT NULL,
   session_token_hashed VARCHAR(100) NOT NULL,
   device_label VARCHAR(100) NOT NULL,
   ip_address INET NOT NULL,
   created_at TIMESTAMP(0) DEFAULT now(),
   expires_at TIMESTAMP(0) NOT NULL,
   last_active_at TIMESTAMP(0) NOT NULL,
   revoked_at TIMESTAMP(0),
   CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
   CONSTRAINT uq_session_token_hashed UNIQUE (session_token_hashed)
);

CREATE INDEX IF NOT EXISTS user_session_user_id ON user_sessions (user_id);

CREATE TABLE IF NOT EXISTS notifications (
   id serial PRIMARY KEY,
   sender_id INTEGER,
   receiver_id INTEGER NOT NULL,
   type VARCHAR(50) NOT NULL,
   related_entity_name VARCHAR(30), -- projects, session, payment(log or smth)
   related_entity_id INTEGER,
   data JSONB, -- Note: Data will store the info about only feedback and ratings primary key and time so that it can take to the right place when its clicked
   read_at TIMESTAMP(0),
   created_at TIMESTAMP(0) DEFAULT now(),
   CONSTRAINT fk_notification_sender_user FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE CASCADE,
   CONSTRAINT fk_notification_receiver_user FOREIGN KEY (receiver_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_receiver_created ON notifications (receiver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_entity_sorting ON notifications (related_entity_name, related_entity_id, type);

CREATE TABLE IF NOT EXISTS projects (
   id serial PRIMARY KEY,
   author_id INTEGER NOT NULL,
   subscription_status VARCHAR(20) NOT NULL DEFAULT 'active' CONSTRAINT chk_project_subscription_status CHECK (subscription_status IN ('active', 'locked')),
   name VARCHAR(30) NOT NULL CONSTRAINT chk_project_name CHECK (name ~ '^[A-Za-z][a-zA-Z0-9_]{0,29}$'),
   description VARCHAR(500),
   api_key_hashed VARCHAR(100),
   api_key_prefix VARCHAR(30),
   auth_enabled BOOLEAN DEFAULT TRUE,
   is_template BOOLEAN DEFAULT FALSE,
   is_clone BOOLEAN DEFAULT FALSE,
   created_at TIMESTAMP(0) DEFAULT now(),
   cloned_from_id INTEGER CONSTRAINT chk_project_clone_from_id CHECK (
      is_clone = TRUE
      OR cloned_from_id IS NULL
   ),
   originates_from_id INTEGER CONSTRAINT chk_project_originate_from CHECK (
      is_template = TRUE
      OR originates_from_id IS NULL
   ),
   CONSTRAINT chk_project_api_key CHECK (
      is_template = FALSE
      OR api_key_hashed IS NULL
   ),
   CONSTRAINT chk_project_api_key_prefix CHECK (
      is_template = FALSE
      OR api_key_prefix IS NULL
   ),
   CONSTRAINT uq_proj_name_author UNIQUE (name , author_id) ,
   CONSTRAINT fk_project_author FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE CASCADE,
   CONSTRAINT fk_project_cloned_from FOREIGN KEY (cloned_from_id) REFERENCES projects (id) ON DELETE SET NULL,
   CONSTRAINT fk_template_originates_from FOREIGN KEY (originates_from_id) REFERENCES projects (id) ON DELETE SET NULL,
   CONSTRAINT chk_template_clone CHECK (
      NOT (
         is_template
         AND is_clone
      )
   )
);

CREATE INDEX IF NOT EXISTS idx_project_author_id_name ON projects (author_id, name);

CREATE TABLE IF NOT EXISTS project_cors_origin (
   project_id INTEGER NOT NULL,
   origin VARCHAR(50) NOT NULL,
   created_at TIMESTAMP(0) DEFAULT now(),
   CONSTRAINT fk_cors_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
   PRIMARY KEY (project_id, origin)
);

CREATE TABLE IF NOT EXISTS tags (
   id serial PRIMARY KEY,
   name VARCHAR(30) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS project_tags (
   project_id INTEGER NOT NULL,
   tag_id INTEGER NOT NULL,
   created_at TIMESTAMP(0) NOT NULL DEFAULT now(),
   CONSTRAINT fk_project_tags_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
   CONSTRAINT fk_project_tags_tag FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE,
   PRIMARY KEY (project_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_project_tags_tag_id ON project_tags (tag_id);

CREATE TABLE IF NOT EXISTS project_logs (
   id serial PRIMARY KEY,
   project_id INTEGER NOT NULL,
   changed_by INTEGER,
   created_at TIMESTAMP(0) NOT NULL DEFAULT now(),
   entity_type VARCHAR(30) NOT NULL,
   entity_id INTEGER,
   change_type VARCHAR(30) NOT NULL,
   old_data JSONB,
   new_data JSONB,
   CONSTRAINT fk_project_logs_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
   CONSTRAINT fk_project_logs_changed_by FOREIGN KEY (changed_by) REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_project_logs_project_id_created_at ON project_logs (project_id, created_at);

CREATE INDEX IF NOT EXISTS idx_project_logs_entity_type_entity_id ON project_logs (entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS project_collaborators (
   project_id INTEGER NOT NULL,
   user_id INTEGER NOT NULL,
   created_at TIMESTAMP(0) NOT NULL DEFAULT now(),
   role VARCHAR(15) NOT NULL CONSTRAINT chk_collaborator_role CHECK (role IN ('editor')),
   status VARCHAR(15) NOT NULL DEFAULT 'pending' CONSTRAINT chk_collaborator_status CHECK (
      status IN ('pending', 'accepted', 'rejected', 'removed')
   ),
   CONSTRAINT fk_collaborates_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
   CONSTRAINT fk_collaborates_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
   PRIMARY KEY (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_collaborators_user_id ON project_collaborators (user_id);

CREATE TABLE IF NOT EXISTS schema_tables (
   id serial PRIMARY KEY,
   project_id INTEGER NOT NULL,
   table_name VARCHAR(30) NOT NULL CONSTRAINT chk_table_name CHECK (table_name ~ '^[a-z_][a-z0-9_]{0,29}$'),
   created_at TIMESTAMP(0) NOT NULL DEFAULT now(),
   CONSTRAINT fk_schema_tables_project_id FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
   CONSTRAINT unique_schema_table_project_id_table_name UNIQUE (project_id, table_name)
);

CREATE TABLE IF NOT EXISTS schema_columns (
   id serial PRIMARY KEY,
   schema_table_id INTEGER NOT NULL,
   col_name VARCHAR(30) NOT NULL CONSTRAINT chk_column_name CHECK (col_name ~ '^[a-z_][a-z0-9_]{0,29}$'),
   col_type VARCHAR(20) NOT NULL CONSTRAINT chk_col_type CHECK (
      UPPER(col_type) IN (
         'INTEGER',
         'TEXT',
         'NUMERIC',
         'BOOLEAN',
         'VARCHAR',
         'DATE',
         'TIMESTAMP'
      )
   ),
   default_value VARCHAR(200),
   col_length INTEGER,
   is_primary_key BOOLEAN DEFAULT FALSE,
   is_auto_increment BOOLEAN DEFAULT FALSE,
   is_nullable BOOLEAN DEFAULT TRUE,
   is_unique BOOLEAN DEFAULT FALSE,
   created_at TIMESTAMP(0) NOT NULL DEFAULT now(),
   CONSTRAINT fk_schema_columns_schema_table_id FOREIGN KEY (schema_table_id) REFERENCES schema_tables (id) ON DELETE CASCADE,
   CONSTRAINT unique_schema_column_table_id_col_name UNIQUE (schema_table_id, col_name),
   CONSTRAINT chk_if_primary_key CHECK (
      NOT is_primary_key
      OR (
         NOT is_nullable
         AND is_unique
      )
   ),
   CONSTRAINT chk_if_auto_increment CHECK (
      NOT is_auto_increment
      OR (
         col_type = 'INTEGER'
         AND is_unique
      )
   )
);

CREATE TABLE IF NOT EXISTS schema_foreign_keys (
   child_col_id INTEGER PRIMARY KEY,
   parent_col_id INTEGER NOT NULL,
   fk_name VARCHAR(30) NOT NULL CONSTRAINT chk_fk_name CHECK (fk_name ~ '^[a-z_][a-z0-9_]{0,29}$'),
   on_delete VARCHAR(20) CONSTRAINT chk_fk_on_delete CHECK (
      UPPER(on_delete) IN ('CASCADE', 'SET NULL', 'RESTRICT', 'NO ACTION')
   ),
   on_update VARCHAR(20) CONSTRAINT chk_fk_on_update CHECK (
      UPPER(on_update) IN ('CASCADE', 'SET NULL', 'RESTRICT', 'NO ACTION')
   ),
   created_at TIMESTAMP(0) NOT NULL DEFAULT now(),
   CONSTRAINT fk_schema_fks_child FOREIGN KEY (child_col_id) REFERENCES schema_columns (id) ON DELETE CASCADE,
   CONSTRAINT fk_schema_fks_parent FOREIGN KEY (parent_col_id) REFERENCES schema_columns (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS api_definitions (
   id serial PRIMARY KEY,
   name VARCHAR(30) NOT NULL CONSTRAINT chk_api_definition_name CHECK (name ~ '^[a-z][a-z0-9_]{0,29}$'),
   project_id INTEGER NOT NULL,
   method VARCHAR(15) NOT NULL CONSTRAINT chk_api_definition_method CHECK (UPPER(method) IN ('GET', 'POST', 'PUT', 'DELETE')),
   query_definition JSONB NOT NULL,
   generated_sql TEXT NOT NULL,
   parameters TEXT,
   is_active BOOLEAN DEFAULT TRUE,
   rate_limit_per_day INTEGER NOT NULL CONSTRAINT chk_api_definition_rate_limit CHECK (rate_limit_per_day > 0),
   updating_parameters TEXT,
   created_at TIMESTAMP(0) NOT NULL DEFAULT now(),
   CONSTRAINT fk_api_definitions_project_id FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
   CONSTRAINT unique_api_definitions_project_id_name UNIQUE (project_id, name)
);

CREATE INDEX IF NOT EXISTS idx_api_definitions ON api_definitions (project_id, name);

CREATE TABLE IF NOT EXISTS api_logs (
   id serial PRIMARY KEY,
   api_definition_id INTEGER NOT NULL,
   ip_address INET NOT NULL,
   status_code INTEGER NOT NULL,
   response_time_ms INTEGER NOT NULL CONSTRAINT chk_api_logs_response_time CHECK (response_time_ms >= 0),
   created_at TIMESTAMP(0) NOT NULL DEFAULT now(),
   CONSTRAINT fk_api_logs_api_definitions FOREIGN KEY (api_definition_id) REFERENCES api_definitions (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_logs_api_definition_id ON api_logs (api_definition_id);

CREATE TABLE IF NOT EXISTS api_table_dependencies (
   api_definition_id INTEGER NOT NULL,
   schema_table_id INTEGER NOT NULL,
   usage_context VARCHAR(30), -- check constraint should be added later
   created_at TIMESTAMP(0) NOT NULL DEFAULT now(),
   PRIMARY KEY (api_definition_id, schema_table_id),
   CONSTRAINT fk_api_table_dependencies_api_definition_id FOREIGN KEY (api_definition_id) REFERENCES api_definitions (id) ON DELETE CASCADE,
   CONSTRAINT fk_api_table_dependencies_api_schema_table_id FOREIGN KEY (schema_table_id) REFERENCES schema_tables (id) ON DELETE RESTRICT
   DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS api_column_dependencies (
   api_definition_id INTEGER NOT NULL,
   schema_col_id INTEGER NOT NULL,
   usage_context VARCHAR(30),
   created_at TIMESTAMP(0) NOT NULL DEFAULT now(),
   PRIMARY KEY (api_definition_id, schema_col_id),
   CONSTRAINT fk_api_column_dependencies_api_definition_id FOREIGN KEY (api_definition_id) REFERENCES api_definitions (id) ON DELETE CASCADE,
   CONSTRAINT fk_api_column_dependencies_schema_col_id FOREIGN KEY (schema_col_id) REFERENCES schema_columns (id) ON DELETE RESTRICT
   DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS template_clones (
   id serial PRIMARY KEY,
   user_id INTEGER NOT NULL,
   template_id INTEGER NOT NULL,
   cloned_project_id INTEGER,
   created_at TIMESTAMP(0) NOT NULL DEFAULT now(),
   CONSTRAINT fk_template_clones_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
   CONSTRAINT fk_template_clones_template_id FOREIGN KEY (template_id) REFERENCES projects (id) ON DELETE CASCADE,
   CONSTRAINT fk_template_clones_cloned_project_id FOREIGN KEY (cloned_project_id) REFERENCES projects (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS template_feedback (
   id serial PRIMARY KEY,
   user_id INTEGER NOT NULL,
   template_id INTEGER NOT NULL,
   message TEXT NOT NULL,
   read_at TIMESTAMP(0),
   created_at TIMESTAMP(0) NOT NULL DEFAULT now(),
   CONSTRAINT fk_template_feedback_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
   CONSTRAINT fk_template_feedback_template_id FOREIGN KEY (template_id) REFERENCES projects (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_feedback_user_id_template_id ON template_feedback (user_id, template_id);

CREATE TABLE IF NOT EXISTS template_ratings (
   user_id INTEGER NOT NULL,
   template_id INTEGER NOT NULL,
   rating INTEGER NOT NULL CONSTRAINT chk_rating_range CHECK (rating BETWEEN 1 AND 5),
   review_text TEXT,
   created_at TIMESTAMP(0) NOT NULL DEFAULT now(),
   updated_at TIMESTAMP(0),
   PRIMARY KEY (user_id, template_id),
   CONSTRAINT fk_template_ratings_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
   CONSTRAINT fk_template_ratings_template_id FOREIGN KEY (template_id) REFERENCES projects (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS template_likes (
   user_id INTEGER NOT NULL,
   template_id INTEGER NOT NULL,
   created_at TIMESTAMP(0) NOT NULL DEFAULT now(),
   PRIMARY KEY (user_id, template_id),
   CONSTRAINT fk_template_likes_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
   CONSTRAINT fk_template_likes_template_id FOREIGN KEY (template_id) REFERENCES projects (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS plans (
   plan_id INTEGER PRIMARY KEY,
   name VARCHAR(15) NOT NULL UNIQUE,
   cost_per_month INTEGER NOT NULL DEFAULT 0,
   project_count INTEGER,
   table_per_project INTEGER,
   api_per_project INTEGER,
   api_call_per_day INTEGER,
   CONSTRAINT chk_plan_cost_per_month CHECK (cost_per_month >= 0),
   CONSTRAINT chk_plan_project_count CHECK (
      project_count > 0
      OR project_count IS NULL
   ),
   CONSTRAINT chk_plan_table_count CHECK (
      table_per_project > 0
      OR table_per_project IS NULL
   ),
   CONSTRAINT chk_plan_api_per_project CHECK (
      api_per_project > 0
      OR api_per_project IS NULL
   ),
   CONSTRAINT chk_plan_api_call_per_day CHECK (
      api_call_per_day > 0
      OR api_call_per_day IS NULL
   )
);

CREATE TABLE IF NOT EXISTS subscriptions (
   subscription_id serial PRIMARY KEY,
   user_id INTEGER NOT NULL,
   plan_id INTEGER NOT NULL,
   start_date TIMESTAMP(0) NOT NULL DEFAULT now(),
   end_date TIMESTAMP(0),
   status VARCHAR(15) NOT NULL DEFAULT 'active' CONSTRAINT chk_subscriptions_status CHECK (status IN ('active', 'inactive')),
   CONSTRAINT fk_subscriptions_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
   CONSTRAINT fk_subscriptions_plan_id FOREIGN KEY (plan_id) REFERENCES plans (plan_id) ON DELETE RESTRICT,
   CONSTRAINT chk_subscription_duration CHECK (end_date > start_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS one_active_subscription_per_user ON subscriptions (user_id)
WHERE
   status = 'active';

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions (user_id);

CREATE TABLE IF NOT EXISTS subscription_log (
   log_id serial PRIMARY KEY,
   subscription_id INTEGER NOT NULL,
   trxn_id VARCHAR(30),
   payment_method VARCHAR(20),
   payment_status VARCHAR(15) NOT NULL DEFAULT 'free',
   amount NUMERIC(20, 4) NOT NULL DEFAULT 0 CONSTRAINT chk_subscription_log_amount CHECK (amount >= 0),
   month_count INTEGER,
   created_at TIMESTAMP(0) NOT NULL DEFAULT now(),
   CONSTRAINT fk_subscription_log_subscription_id FOREIGN KEY (subscription_id) REFERENCES subscriptions (subscription_id) ON DELETE CASCADE,
   CONSTRAINT chk_subscription_log_month_count CHECK (
      (
         payment_status = 'free'
         AND month_count IS NULL
      )
      OR (
         payment_status <> 'free'
         AND month_count > 0
      )
   )
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_log_subscription_id ON subscriptions (subscription_id);

----------------------- NOTIFICATION TRIGGERS STARTS HERE -----------------------
-- types of notifications
/*
collab_invitation, collab_invitation_reject, collab_invitation_accept, own_collab_remove, author_collab_remove
feedback, rating
new_session, payment
limit_crossed
*/
-- Insert notification whenever collaboration request is sent, rejected, accepted or collaborator removed
CREATE OR REPLACE FUNCTION func_collab_change_action ( -- maybe a procedure suits here better
   collab_sender_user_id INTEGER,
   collab_receiver_user_id INTEGER,
   action_project_id INTEGER,
   updated_status VARCHAR,
   old_status VARCHAR
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
      IF updated_status = 'rejected' THEN
         DELETE FROM project_collaborators WHERE project_id = action_project_id AND user_id = collab_receiver_user_id;
      END IF;

      -- Updating notificataion for the receiver
      IF old_status = 'pending' THEN
         UPDATE notifications
         SET data = jsonb_build_object('status', updated_status)
         WHERE sender_id = collab_sender_user_id AND receiver_id = collab_receiver_user_id AND related_entity_name = 'projects' AND related_entity_id = action_project_id AND data->>'status' = 'pending';
      END IF;
      
      -- We need to update project log here, skipping it now deliberately

      RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION tgfunc_notification_on_collaboration () RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
   sender_user_id INTEGER;
   variable_type VARCHAR;
BEGIN

   SELECT author_id
   INTO sender_user_id
   FROM projects
   WHERE id = NEW.project_id;

   IF TG_OP = 'INSERT' THEN
      INSERT INTO notifications
      (sender_id, receiver_id, type, related_entity_name, related_entity_id, data)
      VALUES
      (sender_user_id, NEW.user_id, 'collab_invitation', 'projects', NEW.project_id,  jsonb_build_object('status', 'pending'));

      RETURN NEW;

   ELSIF TG_OP = 'UPDATE' THEN
      IF NEW.status = 'rejected' THEN
         IF NEW.status = 'rejected' AND OLD.status = 'pending' THEN
            variable_type = 'collab_invitation_reject';
         ELSIF NEW.status = 'rejected' AND OLD.status = 'accepted' THEN
            variable_type = 'own_collab_remove';
         END IF;

         INSERT INTO notifications
         (sender_id, receiver_id, type, related_entity_name, related_entity_id)
         VALUES
         (NEW.user_id, sender_user_id, variable_type, 'projects', NEW.project_id);

         PERFORM func_collab_change_action(sender_user_id, NEW.user_id, NEW.project_id, 'rejected', OLD.status);

      ELSIF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
         INSERT INTO notifications
         (sender_id, receiver_id, type, related_entity_name, related_entity_id)
         VALUES
         (NEW.user_id, sender_user_id, 'collab_invitation_accept', 'projects', NEW.project_id);

         PERFORM func_collab_change_action(sender_user_id, NEW.user_id, NEW.project_id, 'accepted', OLD.status);
            
      ELSIF NEW.status = 'removed' THEN
         IF OLD.status = 'pending' THEN
            -- need to remove the notification and collaborator row
            DELETE FROM notifications
            WHERE sender_id = sender_user_id AND receiver_id = NEW.user_id AND related_entity_name = 'projects' AND related_entity_id = NEW.project_id AND data->>'status' = 'pending';

         ELSIF OLD.status = 'accepted' THEN
            -- author has removed the user from the collaboration, so remove from collaborators and send notification to user
             INSERT INTO notifications
            (sender_id, receiver_id, type, related_entity_name, related_entity_id)
            VALUES
            (sender_user_id, NEW.user_id, 'author_collab_remove', 'projects', NEW.project_id);
            -- We need to update project log here, skipping it now deliberately
         END IF;
         
         DELETE FROM project_collaborators WHERE project_id = NEW.project_id AND user_id = NEW.user_id;
      END IF;
   END IF;
   RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_insert_collab_notification ON project_collaborators;

CREATE TRIGGER tg_insert_collab_notification
AFTER INSERT OR UPDATE ON project_collaborators FOR EACH ROW
EXECUTE FUNCTION tgfunc_notification_on_collaboration ();

-- Insert notification related to feedback and rating
-- Note: Feedback can't be deleted or modified once sent.
CREATE OR REPLACE FUNCTION tgfunc_notification_on_feedback_rating () RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
   receiver_user_id INTEGER;
BEGIN
   SELECT author_id
   INTO receiver_user_id
   FROM projects
   WHERE id = NEW.template_id AND is_template = true;

   IF receiver_user_id IS NULL THEN
    RETURN NEW;
   END IF;

   IF TG_ARGV[0] = 'feedback' THEN
      INSERT INTO notifications
      (sender_id, receiver_id, type, related_entity_name, related_entity_id, data)
      VALUES
      (NEW.user_id, receiver_user_id, TG_ARGV[0], 'projects', NEW.template_id, 
         jsonb_build_object(
            'feedback_id', NEW.id,
            'message', NEW.message
         )
      );
   
   ELSIF TG_ARGV[0] = 'rating' THEN
      INSERT INTO notifications
      (sender_id, receiver_id, type, related_entity_name, related_entity_id, data)
      VALUES
      (NEW.user_id, receiver_user_id, TG_ARGV[0], 'projects', NEW.template_id, 
         jsonb_build_object(
            'rating', NEW.rating,
            'review_text', NEW.review_text
         )
      );
   
   END IF;
   RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_insert_feedback_notification ON template_feedback;

CREATE TRIGGER tg_insert_feedback_notification
AFTER INSERT ON template_feedback FOR EACH ROW
EXECUTE FUNCTION tgfunc_notification_on_feedback_rating ('feedback');

DROP TRIGGER IF EXISTS tg_insert_rating_notification ON template_ratings;

CREATE TRIGGER tg_insert_rating_notification
AFTER INSERT ON template_ratings FOR EACH ROW
EXECUTE FUNCTION tgfunc_notification_on_feedback_rating ('rating');

-- Insert notification for login
CREATE OR REPLACE FUNCTION tgfunc_notification_on_login () RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
   INSERT INTO notifications
   (sender_id, receiver_id, type, related_entity_name, related_entity_id)
   VALUES
   (NEW.user_id, NEW.user_id, 'new_session', 'user_sessions', NEW.id);

   RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_insert_login_notification ON user_sessions;

CREATE TRIGGER tg_insert_login_notification
AFTER INSERT ON user_sessions FOR EACH ROW
EXECUTE FUNCTION tgfunc_notification_on_login ();

-- Insert notification for payment and limit (Will be implemented later)
-- Now we have a problem, If a template or project is deleted, how can we delete the notifications related to that template or project as there is no fk for entity id?
-- We need a trigger now
CREATE OR REPLACE FUNCTION tgfunc_delete_notification_by_project () RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
   DELETE FROM notifications
   WHERE related_entity_name = 'projects' AND related_entity_id = OLD.id;
   RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tg_delete_notification_when_project_deleted ON projects;

CREATE TRIGGER tg_delete_notification_when_project_deleted
AFTER DELETE ON projects FOR EACH ROW
EXECUTE FUNCTION tgfunc_delete_notification_by_project ();

----------------------- NOTIFICATION TRIGGERS ENDS HERE -----------------------


------------------------Create schema table trigger--------------------------------
CREATE
OR
REPLACE FUNCTION tgfunc_create_schema_table () RETURNS TRIGGER LANGUAGE plpgsql AS $$ DECLARE
v_is_template BOOLEAN;
BEGIN
  SELECT
    P.is_template INTO v_is_template
  FROM
    projects P
  WHERE
    P.id = NEW.project_ID;
  IF NOT v_is_template THEN
    EXECUTE FORMAT ('CREATE TABLE %I.%I ()', 'PROJECTS', NEW.TABLE_NAME);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_insert_schema_table AFTER INSERT ON schema_tables FOR EACH ROW
  EXECUTE FUNCTION tgfunc_create_schema_table ();
  
  
  
  CREATE OR REPLACE FUNCTION tgfunc_add_columns () RETURNS TRIGGER LANGUAGE plpgsql AS $$ 
  DECLARE 
  rec RECORD;
  v_col_def TEXT;
  v_pk_cols TEXT;
  BEGIN
    SELECT P.is_template , S.TABLE_NAME INTO rec
    FROM schema_tables S
    JOIN projects P ON P.id = S.project_id
    WHERE S.id = NEW.schema_table_id;
     v_col_def := NEW.col_type;
    IF NEW.col_type = 'NUMERIC' THEN
      v_col_def := v_col_def || ' (' || NEW.col_length || ',6) ';
    ELSIF NEW.col_type = 'VARCHAR' THEN
      v_col_def := v_col_def || ' (' || NEW.col_length || ') ';
    END IF;
    IF NEW.is_auto_increment THEN
      v_col_def := v_col_def || ' GENERATED ALWAYS AS IDENTITY ';
    END IF;
    IF  NEW.is_unique THEN
      v_col_def := v_col_def || ' UNIQUE ';
    END IF;
    IF NEW.is_nullable THEN
      v_col_def := v_col_def || ' NOT NULL';
    END IF;
    IF NEW.default_value IS NOT NULL AND NOT NEW.is_auto_increment
     THEN
        IF NEW.col_type IN ('INTEGER', 'NUMERIC') THEN
            IF NEW.default_value !~ '^-?[0-9]+(\.[0-9]+)?$' THEN
               RAISE EXCEPTION 'Invalid numeric default value: %',NEW.default_value;
            END IF;    
          v_col_def := v_col_def || FORMAT (' DEFAULT %s', NEW.default_value);
        ELSIF NEW.col_type IN ('TEXT', 'VARCHAR') THEN
           v_col_def := v_col_def || FORMAT (' DEFAULT %L', NEW.default_value);
        ELSIF NEW.col_type IN ('DATE', 'TIMESTAMP') THEN
              IF UPPER(NEW.default_value) IN ('NOW()', 'CURRENT_TIMESTAMP', 'CURRENT_DATE') THEN
                 v_col_def := v_col_def || FORMAT (' DEFAULT %s', NEW.default_value);
              ELSE v_col_def := v_col_def || FORMAT (' DEFAULT %L', NEW.default_value);
              END IF;
        ELSIF NEW.col_type = 'BOOLEAN' THEN
            IF LOWER(NEW.default_value) IN ('true', 'false') THEN
                v_col_def := v_col_def || FORMAT (' DEFAULT %s', LOWER(NEW.default_value));
            ELSE RAISE EXCEPTION 'Invalid BOOLEAN default value: % ',NEW.default_value;
            END IF;
        ELSE RAISE EXCEPTION 'Invalid data type: % ',NEW.col_type;
      END IF;
      END IF;
      IF NOT rec.is_template THEN
        EXECUTE FORMAT ('ALTER TABLE %I.%I ADD COLUMN %I %s ', 'PROJECT_tables',rec.TABLE_NAME, NEW.col_name, v_col_def);
         IF NEW.is_primary_key THEN
            SELECT string_agg(formate('%I',col_name),',' ORDER BY col_name)
            INTO v_pk_cols 
            FROM schema_columns WHERE schema_table_id = NEW.schema_table_id AND is_primary_key = true;
            EXECUTE FORMAT ('ALTER TABLE %I.%I DROP CONSTRAINT IF EXISTS %I', 'PROJECT_tables', rec.TABLE_NAME, rec.TABLE_NAME||'_pk');
            EXECUTE FORMAT ('ALTER TABLE %I.%I ADD CONSTRAINT  %I PRIMARY KEY(%s)', 'PROJECTS-tables', rec.TABLE_NAME,rec.TABLE_NAME||'_pk', v_pk_cols);
         END IF;
     END IF;
      RETURN NEW;
    END;
    $$;
     
     CREATE TRIGGER tg_insert_schema_column AFTER INSERT ON schema_columns FOR EACH ROW
      EXECUTE FUNCTION tgfunc_add_columns ();
   
    CREATE OR REPLACE FUNCTION tgfunc_add_fks () RETURNS TRIGGER LANGUAGE plpgsql AS $$ 
  DECLARE 
  rec RECORD ;
  fk_def TEXT;
  BEGIN
    SELECT P.is_template , S1.TABLE_NAME as child_table , S2.TABLE_NAME as parent_table, Ch.col_name  AS child_name, Pa.col_name AS parent_name  INTO rec
    FROM schema_columns Ch 
    JOIN schema_tables S1 ON S1.id = Ch.schema_table_id
        JOIN projects P ON P.id = S1.project_id,
        schema_columns Pa
    JOIN schema_tables S2 ON S2.id = Pa.schema_table_id
    WHERE Ch.id = NEW.child_col_id AND pa.id = NEW.parent_col_id ;
     fk_def := 'FOREIGN KEY ( '||rec.child_name||' ) REFERENCES '
               ||rec.parent_table ||'('|| rec.parent_name ||') ON DELETE '|| NEW.on_delete ||' ON UPDATE '||NEW.on_update;
     IF NOT rec.is_template THEN
        EXECUTE FORMAT ('ALTER TABLE %I.%I ADD CONSTRAINT %I %s ', 'PROJECTS',rec.child_table,  NEW.fk_name, fk_def );
     END IF;
      RETURN NEW;
    END;
    $$;
     
     CREATE TRIGGER tg_insert_schema_fks AFTER INSERT ON schema_foreign_keys FOR EACH ROW
      EXECUTE FUNCTION tgfunc_add_fks ();
      



