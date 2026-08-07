CREATE TABLE IF NOT EXISTS users (
   id serial PRIMARY KEY,
   name VARCHAR(30),
   email VARCHAR(40) UNIQUE CONSTRAINT user_email_check CHECK (email LIKE '%@%'),
   username VARCHAR(40) NOT NULL UNIQUE,
   password_hash VARCHAR(100) NOT NULL,
   dp VARCHAR(100),
   settings VARCHAR(30) NOT NULL DEFAULT 'Default goes here', -- Note: Settings will be JSONB
   joined_at TIMESTAMP(0) DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_sessions (
   id serial PRIMARY KEY,
   user_id INTEGER NOT NULL,
   session_token_hashed VARCHAR(100) NOT NULL,
   device_label VARCHAR(100) NOT NULL,
   ip_address INET NOT NULL,
   created_at TIMESTAMP(0) DEFAULT now(),
   expires_at TIMESTAMP NOT NULL,
   last_active_at TIMESTAMP NOT NULL,
   revoked_at TIMESTAMP,
   CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES Users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notifications (
   id serial PRIMARY KEY,
   sender_id INTEGER,
   receiver_id INTEGER NOT NULL,
   type VARCHAR(50) NOT NULL,
   related_entity_name VARCHAR(30), -- projects, session, payment(log or smth)
   related_entity_id INTEGER,
   data JSONB, -- Note: Data will store the info about only feedback and ratings primary key and time so that it can take to the right place when its clicked
   read_at TIMESTAMP,
   created_at TIMESTAMP(0) DEFAULT now(),
   CONSTRAINT fk_notification_sender_user FOREIGN KEY (sender_id) REFERENCES Users (id) ON DELETE SET NULL,
   CONSTRAINT fk_notification_receiver_user FOREIGN KEY (receiver_id) REFERENCES Users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_receiver_created ON notifications (receiver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_entity_sorting ON notifications (related_entity_name, related_entity_id, type);

CREATE TABLE IF NOT EXISTS projects (
   id serial PRIMARY KEY,
   author_id INTEGER NOT NULL,
   name VARCHAR(30) NOT NULL,
   description VARCHAR(500),
   api_key_hashed VARCHAR(100) NOT NULL,
   api_key_prefix VARCHAR(30) NOT NULL,
   auth_enabled BOOLEAN,
   like_count INTEGER DEFAULT 0,
   total_review_given INTEGER DEFAULT 0,
   avg_rating REAL DEFAULT 0,
   is_template BOOLEAN DEFAULT FALSE,
   is_clone BOOLEAN DEFAULT FALSE,
   created_at TIMESTAMP(0) DEFAULT now(),
   cloned_from_id INTEGER,
   originates_from_id INTEGER,
   CONSTRAINT fk_project_author FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE CASCADE,
   CONSTRAINT fk_project_cloned_from FOREIGN KEY (cloned_from_id) REFERENCES projects (id) ON DELETE SET NULL,
   CONSTRAINT fk_template_originates_from FOREIGN KEY (originates_from_id) REFERENCES projects (id) ON DELETE SET NULL
);

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
   created_at TIMESTAMP NOT NULL DEFAULT now(),
   CONSTRAINT fk_project_tags_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
   CONSTRAINT fk_project_tags_tag FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE,
   PRIMARY KEY (project_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_project_tags_tag_id ON project_tags (tag_id);

CREATE TABLE IF NOT EXISTS project_logs (
   id serial PRIMARY KEY,
   project_id INTEGER NOT NULL,
   changed_by INTEGER NOT NULL,
   created_at TIMESTAMP NOT NULL DEFAULT now(),
   entity_type VARCHAR(30) NOT NULL,
   entity_id INTEGER NOT NULL,
   change_type VARCHAR(20) NOT NULL,
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
   created_at TIMESTAMP NOT NULL DEFAULT now(),
   role VARCHAR(15) NOT NULL,
   status VARCHAR(15) NOT NULL DEFAULT 'pending',
   CONSTRAINT fk_collaborates_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
   CONSTRAINT fk_collaborates_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
   PRIMARY KEY (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_collaborators_user_id ON project_collaborators (user_id);

CREATE TABLE IF NOT EXISTS schema_tables (
   id serial PRIMARY KEY,
   project_id INTEGER NOT NULL,
   table_name VARCHAR(30) NOT NULL,
   db_schema_name VARCHAR(30) NOT NULL,
   created_at TIMESTAMP NOT NULL DEFAULT now(),
   CONSTRAINT fk_schema_tables_project_id FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
   CONSTRAINT unique_schema_table_project_id_table_name UNIQUE (project_id, table_name)
);

CREATE TABLE IF NOT EXISTS schema_columns (
   id serial PRIMARY KEY,
   schema_table_id INTEGER NOT NULL,
   col_name VARCHAR(30) NOT NULL,
   col_type VARCHAR(20) NOT NULL,
   default_value VARCHAR(30),
   col_length INTEGER,
   is_primary_key BOOLEAN DEFAULT FALSE,
   is_auto_increment BOOLEAN DEFAULT FALSE,
   is_nullable BOOLEAN DEFAULT TRUE,
   is_unique BOOLEAN DEFAULT FALSE,
   created_at TIMESTAMP NOT NULL DEFAULT now(),
   CONSTRAINT fk_schema_columns_schema_table_id FOREIGN KEY (schema_table_id) REFERENCES schema_tables (id) ON DELETE CASCADE,
   CONSTRAINT unique_schema_column_table_id_col_name UNIQUE (schema_table_id, col_name)
);

CREATE TABLE IF NOT EXISTS schema_foreign_keys (
   child_col_id INTEGER PRIMARY KEY,
   parent_col_id INTEGER NOT NULL,
   fk_name VARCHAR(30) NOT NULL,
   db_schema_name VARCHAR(30) NOT NULL,
   on_delete VARCHAR(20),
   on_update VARCHAR(20),
   created_at TIMESTAMP NOT NULL DEFAULT now(),
   CONSTRAINT fk_schema_fks_child FOREIGN KEY (child_col_id) REFERENCES schema_columns (id) ON DELETE CASCADE,
   CONSTRAINT fk_schema_fks_parent FOREIGN KEY (parent_col_id) REFERENCES schema_columns (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS api_definitions (
   id serial PRIMARY KEY,
   name VARCHAR(30) NOT NULL,
   project_id INTEGER NOT NULL,
   METHOD VARCHAR(15) NOT NULL,
   query_definition JSONB NOT NULL,
   generated_sql TEXT NOT NULL,
   parameters TEXT,
   is_active BOOLEAN DEFAULT TRUE,
   rate_limit_per_day INTEGER NOT NULL,
   updating_parameters TEXT,
   created_at TIMESTAMP NOT NULL DEFAULT now(),
   CONSTRAINT fk_api_definitions_project_id FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
   CONSTRAINT unique_api_definitions_project_id_name UNIQUE (project_id, name)
);

CREATE INDEX IF NOT EXISTS idx_api_definitions ON api_definitions (project_id, name);

CREATE TABLE IF NOT EXISTS api_logs (
   id serial PRIMARY KEY,
   api_definition_id INTEGER NOT NULL,
   ip_address INET NOT NULL,
   status_code INTEGER NOT NULL,
   response_time_ms INTEGER NOT NULL,
   created_at TIMESTAMP NOT NULL DEFAULT now(),
   CONSTRAINT fk_api_logs_api_definitions FOREIGN KEY (api_definition_id) REFERENCES api_definitions (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS api_table_dependencies (
   api_definition_id INTEGER NOT NULL,
   schema_table_id INTEGER NOT NULL,
   usage_context VARCHAR(30),
   created_at TIMESTAMP NOT NULL DEFAULT now(),
   PRIMARY KEY (api_definition_id, schema_table_id),
   CONSTRAINT fk_api_table_dependencies_api_definition_id FOREIGN KEY (api_definition_id) REFERENCES api_definitions (id) ON DELETE CASCADE,
   CONSTRAINT fk_api_table_dependencies_api_schema_table_id FOREIGN KEY (schema_table_id) REFERENCES schema_tables (id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS api_column_dependencies (
   api_definition_id INTEGER NOT NULL,
   schema_col_id INTEGER NOT NULL,
   usage_context VARCHAR(30),
   created_at TIMESTAMP NOT NULL DEFAULT now(),
   PRIMARY KEY (api_definition_id, schema_col_id),
   CONSTRAINT fk_api_column_dependencies_api_definition_id FOREIGN KEY (api_definition_id) REFERENCES api_definitions (id) ON DELETE CASCADE,
   CONSTRAINT fk_api_column_dependencies_schema_col_id FOREIGN KEY (schema_col_id) REFERENCES schema_columns (id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS template_clones (
   id serial PRIMARY KEY,
   user_id INTEGER NOT NULL,
   template_id INTEGER NOT NULL,
   cloned_project_id INTEGER,
   created_at TIMESTAMP NOT NULL DEFAULT now(),
   CONSTRAINT fk_template_clones_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
   CONSTRAINT fk_template_clones_template_id FOREIGN KEY (template_id) REFERENCES projects (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS template_feedback (
   id serial PRIMARY KEY,
   user_id INTEGER NOT NULL,
   template_id INTEGER NOT NULL,
   message TEXT NOT NULL,
   is_read BOOLEAN DEFAULT FALSE,
   created_at TIMESTAMP NOT NULL DEFAULT now(),
   CONSTRAINT fk_template_feedback_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL, -- Even if the user is deleted, we keep the feedback for projects
   CONSTRAINT fk_template_feedback_template_id FOREIGN KEY (template_id) REFERENCES projects (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_feedback_user_id_template_id ON template_feedback (user_id, template_id);

CREATE TABLE IF NOT EXISTS template_ratings (
   user_id INTEGER NOT NULL,
   template_id INTEGER NOT NULL,
   rating INTEGER NOT NULL CONSTRAINT rating_range_check CHECK (rating BETWEEN 1 AND 5),
   review_text TEXT,
   created_at TIMESTAMP NOT NULL DEFAULT now(),
   PRIMARY KEY (user_id, template_id),
   CONSTRAINT fk_template_ratings_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
   CONSTRAINT fk_template_ratings_template_id FOREIGN KEY (template_id) REFERENCES projects (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS template_likes (
   user_id INTEGER NOT NULL,
   template_id INTEGER NOT NULL,
   created_at TIMESTAMP NOT NULL DEFAULT now(),
   PRIMARY KEY (user_id, template_id),
   CONSTRAINT fk_template_likes_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
   CONSTRAINT fk_template_likes_template_id FOREIGN KEY (template_id) REFERENCES projects (id) ON DELETE CASCADE
);

-- Trigger Function and Trigger to automatically update like count of template
CREATE OR REPLACE FUNCTION tgfunc_update_like_count () RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE projects
        SET like_count = like_count + 1
        WHERE id = NEW.template_id;

        RETURN NEW;

    ELSIF TG_OP = 'DELETE' THEN
        UPDATE projects
        SET like_count = like_count - 1
        WHERE id = OLD.template_id;

        RETURN OLD;
    END IF;
END;
$$;

DROP TRIGGER IF EXISTS tg_update_like_count ON template_likes;

CREATE TRIGGER tg_update_like_count
AFTER INSERT OR DELETE ON template_likes FOR EACH ROW
EXECUTE FUNCTION tgfunc_update_like_count ();

-- Trigger Function and Trigger to automatically update avg rating
CREATE OR REPLACE FUNCTION tgfunc_update_avg_rating () RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
   IF TG_OP = 'INSERT' THEN
      UPDATE projects
      SET
      avg_rating = ((avg_rating * total_review_given) + NEW.rating) / (total_review_given + 1),
      total_review_given = total_review_given + 1
      WHERE id = NEW.template_id;

      RETURN NEW;

   ELSIF TG_OP = 'UPDATE' THEN
      UPDATE projects 
      SET
      avg_rating = ((avg_rating * total_review_given) - OLD.rating + NEW.rating) / total_review_given
      WHERE id = NEW.template_id;

      RETURN NEW;
   ELSIF TG_OP = 'DELETE' THEN
      UPDATE projects
      SET
      avg_rating = 
         CASE
            WHEN total_review_given > 1 THEN
               ((avg_rating * total_review_given) - OLD.rating) / (total_review_given - 1)
            ELSE
               0
         END,
      total_review_given = total_review_given -1
      WHERE id = OLD.template_id;

      RETURN OLD;
   END IF;

END;
$$;

DROP TRIGGER IF EXISTS tg_update_avg_rating ON template_ratings;

CREATE TRIGGER tg_update_avg_rating
AFTER INSERT OR DELETE OR UPDATE ON template_ratings FOR EACH ROW
EXECUTE FUNCTION tgfunc_update_avg_rating ();

-- types of notifications
/*
collab_invitation, collab_invitation_reject, collab_invitation_accept, collab_remove
feedback, rating
new_session, payment
limit_crossed
*/
-- Insert notification whenever collaboration request is sent, rejected, accepted or collaborator removed
CREATE OR REPLACE FUNCTION tgfunc_notification_on_collaboration () RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
   sender_user_id INTEGER;
BEGIN
   IF TG_OP <> 'DELETE' THEN
      SELECT author_id
      INTO sender_user_id
      FROM projects
      WHERE id = NEW.project_id;
   ELSE
      SELECT author_id
      INTO sender_user_id
      FROM projects
      WHERE id = OLD.project_id;
   END IF;

   IF TG_OP = 'INSERT' THEN
      INSERT INTO notifications
      (sender_id, receiver_id, type, related_entity_name, related_entity_id)
      VALUES
      (sender_user_id, NEW.user_id, 'collab_invitation', 'projects', NEW.project_id);

      RETURN NEW;

   ELSIF TG_OP = 'DELETE' AND OLD.status = 'accepted' THEN
      INSERT INTO notifications
      (sender_id, receiver_id, type, related_entity_name, related_entity_id)
      VALUES
      (sender_user_id, OLD.user_id, 'collab_remove', 'projects', OLD.project_id);
       
      -- We need to update project log here, skipping it now deliberately
      RETURN OLD;

   ELSIF TG_OP = 'UPDATE' THEN
      IF OLD.status = 'pending' AND NEW.status = 'rejected' THEN
         INSERT INTO notifications
         (sender_id, receiver_id, type, related_entity_name, related_entity_id)
         VALUES
         (NEW.user_id, sender_user_id, 'collab_invitation_reject', 'projects', NEW.project_id);

         DELETE FROM project_collaborators WHERE project_id = NEW.project_id AND user_id = NEW.user_id;

         RETURN NEW;
      ELSIF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
         INSERT INTO notifications
         (sender_id, receiver_id, type, related_entity_name, related_entity_id)
         VALUES
         (NEW.user_id, sender_user_id, 'collab_invitation_accept', 'projects', NEW.project_id);

         -- We need to update project log here, skipping it now deliberately
      
         RETURN NEW;
      END IF;
   END IF;
   RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_insert_collab_notification ON project_collaborators;

CREATE TRIGGER tg_insert_collab_notification
AFTER INSERT OR DELETE OR UPDATE ON project_collaborators FOR EACH ROW
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

DROP TRIGGER IF EXISTS tg_insert_feedback_notification on template_feedback;

CREATE TRIGGER tg_insert_feedback_notification
AFTER INSERT ON template_feedback FOR EACH ROW
EXECUTE FUNCTION tgfunc_notification_on_feedback_rating ('feedback');

DROP TRIGGER IF EXISTS tg_insert_rating_notification on template_ratings;

CREATE TRIGGER tg_insert_rating_notification
AFTER INSERT ON template_ratings FOR EACH ROW
EXECUTE FUNCTION tgfunc_notification_on_feedback_rating ('rating');