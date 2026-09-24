function isDescribe(options) {
    return options && options.mode === 'describe';
}

function formatLiteral(value) {
    if (typeof value === 'string') return JSON.stringify(value);
    if (value === undefined) return 'undefined';
    return JSON.stringify(value);
}

function longSource(source) {
    if (source === 'body' || source === 'body_field') return 'body param';
    if (source === 'query_param') return 'query param';
    if (source === 'route_param') return 'route param';
    return source;
}

function describeStatic(value) {
    return `${formatLiteral(value)} static value`;
}

function describeParam(fieldName, source, fallback) {
    const hasFallback = fallback !== undefined && fallback !== null && fallback !== '';
    if (hasFallback) {
        return `${fieldName} -> ${longSource(source)} -> fallback: ${formatLiteral(fallback)}`;
    }
    return `${fieldName} -> ${longSource(source)}`;
}

function getDynamicSource(req, type, fieldName) {
    if (type === 'query_param') return req.query ? req.query[fieldName] : undefined;
    if (type === 'body') return req.body ? req.body[fieldName] : undefined;
    if (type === 'route_param') return req.params ? req.params[fieldName] : undefined;
    return undefined;
}

function getValueSource(req, source, fieldName) {
    if (source === 'body_field') return req.body ? req.body[fieldName] : undefined;
    if (source === 'query_param') return req.query ? req.query[fieldName] : undefined;
    if (source === 'route_param') return req.params ? req.params[fieldName] : undefined;
    return undefined;
}

function resolveVal(valObj, req, label, options) {
    if (isDescribe(options)) {
        if (!valObj.is_dynamic) {
            return describeStatic(valObj.fallback_value);
        }
        return describeParam(valObj.dynamic_field_name, valObj.dynamic_value_getting_type, valObj.fallback_value);
    }

    if (!valObj.is_dynamic) {
        return valObj.fallback_value;
    }
    const fromRequest = getDynamicSource(req, valObj.dynamic_value_getting_type, valObj.dynamic_field_name);
    if (fromRequest !== undefined && fromRequest !== null && fromRequest !== '') {
        return fromRequest;
    }
    if (valObj.is_dynamic_required) {
        const err = new Error(`Missing required ${valObj.dynamic_value_getting_type} field "${valObj.dynamic_field_name}" for ${label}`);
        err.status = 400;
        throw err;
    }
    return valObj.fallback_value;
}

function resolveValueObj(valObj, req, label, options) {
    if (isDescribe(options)) {
        if (valObj.source === 'static_value') {
            return describeStatic(valObj.default_value);
        }
        return describeParam(valObj.dynamic_field_name, valObj.source, valObj.default_value);
    }

    if (valObj.source === 'static_value') {
        return valObj.default_value;
    }
    const fromRequest = getValueSource(req, valObj.source, valObj.dynamic_field_name);
    if (fromRequest !== undefined && fromRequest !== null && fromRequest !== '') {
        return fromRequest;
    }
    if (valObj.default_value !== undefined && valObj.default_value !== null) {
        return valObj.default_value;
    }
    const err = new Error(`Missing required ${valObj.source} field "${valObj.dynamic_field_name}" for ${label}`);
    err.status = 400;
    throw err;
}

function resolvePagingVal(val, req, label, options) {
    if (val != null && typeof val === 'object') return resolveVal(val, req, label, options);
    if (isDescribe(options)) return describeStatic(val);
    return val;
}

module.exports = {
    isDescribe,
    resolveVal,
    resolveValueObj,
    resolvePagingVal
};
