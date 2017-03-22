/**
 * The external dependencies.
 */
import { takeEvery } from 'redux-saga';
import { call, put, select } from 'redux-saga/effects';
import { find, findIndex, merge, keyBy } from 'lodash';

/**
 * The internal dependencies.
 */
import { getFields, getFieldById, isFieldTabbed } from 'fields/selectors';

import {
	addComplexGroupIdentifiers,
	flattenComplexGroupFields,
	restoreField
} from 'fields/helpers';

import {
	addFields,
	removeFields,
	updateField,
	addComplexGroup,
	cloneComplexGroup,
	removeComplexGroup,
	receiveComplexGroup,
	switchComplexTab
} from 'fields/actions';

import { TYPE_COMPLEX } from 'fields/constants';

/**
 * Prepare a clone or a new instance of the specified group.
 *
 * @param  {Object} action
 * @param  {String} action.type
 * @param  {Object} action.payload
 * @param  {String} action.fieldId
 * @param  {String} [action.groupId]
 * @param  {String} [action.groupName]
 * @return {void}
 */
export function* workerAddOrCloneComplexGroup({ type, payload: { fieldId, groupId, groupName } }) {
	const field = yield select(getFieldById, fieldId);
	const isTabbed = yield select(isFieldTabbed, fieldId);
	const isAddAction = type === addComplexGroup.toString();
	const isCloneAction = type === cloneComplexGroup.toString();

	let blueprint, group, fields;

	// Get the group that will be used as starting point.
	if (isAddAction) {
		blueprint = yield call(find, field.groups, { name: groupName });
	} else if (isCloneAction) {
		blueprint = yield call(find, field.value, { id: groupId });
	}

	// Create a safe copy of the group.
	group = yield call(merge, {}, blueprint);

	// Replace the fields' references in the group.
	if (isCloneAction) {
		const all = yield select(getFields);
		group.fields = group.fields.map(field => restoreField(field, all));
	}

	fields = [];

	addComplexGroupIdentifiers(field, group, field.value.length);
	flattenComplexGroupFields(group, fields);

	fields = keyBy(fields, 'id');

	yield put(addFields(fields));
	yield put(receiveComplexGroup(fieldId, group));

	if (isTabbed) {
		yield put(switchComplexTab(fieldId, group.id));
	}
}

/**
 * Get a flat array that contains the ids of the fields in specified tree.
 *
 * @param  {Object[]} roots
 * @param  {Object}   all
 * @param  {String[]} accumulator
 * @return {String[]}
 */
function collectFieldIds(roots, all, accumulator) {
	roots.forEach((field) => {
		accumulator.push(field.id);

		if (field.type === TYPE_COMPLEX) {
			all[field.id].value.forEach((group) => {
				collectFieldIds(group.fields, all, accumulator);
			});
		}
	});

	return accumulator;
}

/**
 * Prepare the specified complex group for removal.
 *
 * @param  {Object} action
 * @param  {Object} action.payload
 * @param  {String} action.payload.fieldId
 * @param  {String} action.payload.groupId
 * @return {void}
 */
export function* workerRemoveComplexGroup({ payload: { fieldId, groupId } }) {
	const all = yield select(getFields);
	const field = yield select(getFieldById, fieldId);
	const group = yield call(find, field.value, { id: groupId });
	const groupFields = yield call(collectFieldIds, group.fields, all, []);
	const isTabbed = yield select(isFieldTabbed, fieldId);

	if (isTabbed) {
		const groupIndex = yield call(findIndex, field.value, { id: groupId });
		let nextGroupId = null;

		if (field.value.length > 1) {
			if (groupIndex > 0) {
				nextGroupId = field.value[groupIndex - 1].id;
			} else {
				nextGroupId = field.value[1].id;
			}
		}

		yield put(switchComplexTab(fieldId, nextGroupId));
	}

	yield put(updateField(fieldId, {
		value: field.value.filter(({ id }) => id !== groupId),
	}));

	yield put(removeFields(groupFields));
}

/**
 * Start to work.
 *
 * @return {void}
 */
export default function* foreman() {
	yield [
		takeEvery(addComplexGroup, workerAddOrCloneComplexGroup),
		takeEvery(cloneComplexGroup, workerAddOrCloneComplexGroup),
		takeEvery(removeComplexGroup, workerRemoveComplexGroup),
	];
}
