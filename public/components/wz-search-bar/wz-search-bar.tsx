/*
 * Wazuh app - React component for show search and filter in the rules,decoder and CDB lists.
 * Copyright (C) 2015-2019 Wazuh, Inc.
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * Find more information about this on the LICENSE file.
 */
import React, { Component, KeyboardEvent } from 'react';
import PropTypes, {InferProps} from 'prop-types';
import { EuiSuggest } from '../eui-suggest';
import { WzSearchFormatSelector } from './wz-search-format-selector';
import { WzSearchBadges } from './wz-search-badges';
import { QInterpreter, queryObject } from './lib/q-interpreter';
import { EuiFlexGroup, EuiFlexItem } from '@elastic/eui';

interface suggestItem {
  type: {iconType: string, color: string }
  label: string
  description?: string
}

interface qSuggests {
  label: string
  description: string
  operators?: string[]
  values: Function | [] | undefined
}

interface apiSuggests {
  label: string
  description: string
  values?: string[]
  multiValue?: boolean
  range?: boolean
}

export default class WzSearchBar extends Component {
  state: {
    searchFormat: string | null
    suggestions: suggestItem[]
    isProcessing: boolean
    inputStage: string
    inputValue: string
    isSearch: boolean
    lastField?: string
    lastOperator?: string
    isInvalid: boolean
    status: string
    filters: {}
  };
  props!:{
    qSuggests: qSuggests[]
    apiSuggests: apiSuggests[]
    onInputChange: Function
    searchDisable?: boolean
  };
  operators: {};

  constructor(props) {
    super(props);
    this.operators = {
      '=': 'Equal',
      '!=': 'Not equal',
      '>': 'Bigger',
      '<': 'Smaller',
      '~': 'Like',
    }

    this.state = {
      searchFormat: (props.qSuggests) ? '?Q' : (props.apiSuggests) ? 'API' : null,
      suggestions: [],
      isProcessing: false,
      inputStage: 'fields',
      inputValue: '',
      isSearch: false,
      isInvalid: false,
      status: 'unchanged',
      filters: {}
    }
  }

  componentDidMount() {
    this.buildSuggestFields();
  }

  isUpdated() {
    const { isProcessing, isInvalid } = this.state;
    return isProcessing && !isInvalid;
  }

  componentDidUpdate() {
    if (!this.isUpdated()){
      return;
    }
    const { inputStage, searchFormat} = this.state;
    if (inputStage === 'fields'){
      this.buildSuggestFields();
    } else if (inputStage === 'operators' && searchFormat) {
      this.buildSuggestOperators();
    } else if (inputStage === 'values' && searchFormat) {
      this.buildSuggestValues();
    } else if (inputStage === 'conjuntions' && searchFormat){
      this.buildSuggestConjuntions();
    }
    this.setState({isProcessing: false});
  }


  buildSuggestFields() {
    const { searchFormat, inputValue } = this.state;
    const { searchDisable } = this.props;
    const fields:suggestItem[] = [];
    let isSearch = true;
    if (searchFormat === '?Q') {
      fields.push(...this.buildSuggestFieldsQ());
    } else if (searchFormat === 'API') {
      fields.push(...this.buildSuggestFieldAPI());
    }

    if (!searchDisable && inputValue !== '') {
      const suggestSearch = this.buildSuggestFieldsSearch();
      // @ts-ignore
      suggestSearch && fields.unshift(suggestSearch);
    }

    this.setState({suggestions: fields, isSearch });
  }

  buildSuggestFieldsSearch():suggestItem | undefined {
    const { inputValue } = this.state;
    const qInterpreter = new QInterpreter(inputValue);
    if (qInterpreter.qNumber() <= 1) {
      const searchSuggestItem: suggestItem = {
        type: { iconType: 'search', color: 'tint8' },
        label: inputValue,
      };
      return searchSuggestItem;
    }
  }

  buildSuggestFieldsQ():suggestItem[] {
    const { qSuggests } = this.props
    const { inputValue } = this.state;
    const qInterpreter = new QInterpreter(inputValue);
    const { field } = qInterpreter.lastQuery();
    const fields:suggestItem[] = qSuggests
    .filter((item) => this.filterSuggestFields(item, field))
    .map(this.mapSuggestFields);
    
    return fields;
  }

  buildSuggestFieldAPI():suggestItem[] {
    const { apiSuggests } = this.props;
    const { inputValue } = this.state;
    const { 0:field } = inputValue.split(':');
    const fields:suggestItem[] = apiSuggests
    .filter((item) => this.filterSuggestFields(item, field))
    .map(this.mapSuggestFields)
    return fields;
  }

  filterSuggestFields(item:(apiSuggests | qSuggests), field:string) {
    return item.label.includes(field);
  }

  mapSuggestFields(item:(apiSuggests | qSuggests)):suggestItem {
    const suggestItem = {
      type: { iconType: 'kqlField', color: 'tint4' },
      label: item.label,
    }
    if (item.description) {
      suggestItem['description'] = item.description;
    }
    return suggestItem;
  }

  

  buildSuggestOperators() {
    const { operators=false } = this.getCurrentField();
    const operatorsAllow = operators 
      ? operators 
      : [...Object.keys(this.operators)];
    const suggestions:suggestItem[] = operatorsAllow.map(this.CreateSuggestOperator);

    this.setState({
      suggestions,
      isSearch: false,
    })
  }

  getLastQuery():queryObject {
    const { inputValue }= this.state;
    const qInterpreter = new QInterpreter(inputValue);
    return qInterpreter.lastQuery();
  }

  getCurrentField():qSuggests {
    const { field } = this.getLastQuery();
    const { qSuggests } = this.props;
    const currentField = qSuggests.find((item) => {return item.label === field});
    if (currentField) {
      return currentField;
    } else {
      throw Error('Error when try to get the current suggest element')
    }
  }

  CreateSuggestOperator = (operator):suggestItem => {
    return {
      type: { iconType: 'kqlOperand', color: 'tint1' },
      label: operator,
      description: this.operators[operator]
    }
  }

  buildSuggestValues() {
    const { field } = this.getLastQuery();
    const {values} = this.getCurrentField();
    const rawSuggestions:suggestItem[] = typeof values === 'function'
      ? values()
      : values;

    const suggestions:suggestItem[] = []
    for (const value of rawSuggestions) {
      const item:suggestItem = {
        type: {iconType: 'kqlValue', color: 'tint0'},
        // @ts-ignore
        label: typeof value !== 'string' ? value.toString(): value,
      }
      suggestions.push(item);
    }
    this.setState({
      suggestions,
      isSearch: false,
    });
  }

  buildSuggestConjuntions() {
    const suggestions = [
      {'label':',', 'description':'OR'},
      {'label':';', 'description':'AND'}
    ].map((item) => {
      return {
        type: { iconType: 'kqlSelector', color: 'tint3' },
        label: item.label,
        description: item.description
      }
    })
    this.setState({
      suggestions,
      isSearch: false,
    })
  }

  onInputChange = (value:string) => {
    const { filters } = this.state;
    if (value.length === 0) {
      delete filters['q'];
      this.props.onInputChange(filters);
    }
    
    this.setState({
      inputValue: value,
      isProcessing: true,
      filters
    });
    this.inputStageHandler(value);
  }
  
  onChangeSearchFormat = (format) => {console.log(format)}
  
  onKeyPress = (e:KeyboardEvent)  => {
    const { isInvalid } = this.state;
    if(e.key !== 'Enter' && !isInvalid) {
      return;
    }
    const { isSearch, inputValue, filters } = this.state;
    if (isSearch) {
      filters['search'] = inputValue;
      this.setState({inputValue:'', isProcessing: true});
    } else if(inputValue.length > 0) {
      filters['q'] = inputValue;
    }
    this.props.onInputChange(filters);
    this.setState({filters})
  }

  onItemClick(item: suggestItem) {
    const { inputValue, filters } = this.state;
    const qInterperter = new QInterpreter(inputValue);
    let inputStage:string = '';
    if (item.type.iconType === 'kqlField') {
      qInterperter.setlastQuery(item.label);
      inputStage = 'operators';
    } else if (item.type.iconType === 'kqlOperand') {
      qInterperter.setlastQuery(item.label);
      inputStage = 'values';
    } else if (item.type.iconType === 'kqlValue' && item.type.color === 'tint0') {
      qInterperter.setlastQuery(item.label);
      filters['q'] = qInterperter.toString()
      this.props.onInputChange(filters);
      inputStage = 'conjuntions';
    } else if (item.type.iconType === 'kqlSelector') {
      qInterperter.addNewQuery(item.label);
      inputStage = 'fields';
    } else if (item.type.iconType === 'search') {
      filters['search'] = inputValue;
      this.props.onInputChange(filters);
    }
    this.setState({
      inputValue: qInterperter.toString(),
      isProcessing: true,
      filters,
      inputStage,
    });
  }

  onDeleteBadge(badge) {
    const { filters } = this.state;
    delete filters[badge.field];
    this.props.onInputChange(filters);
    this.setState({filters});
  }

  inputStageHandler(inputValue: string) {
    const qInterpreter = new QInterpreter(inputValue);

    const {field, value=false } = qInterpreter.lastQuery()
    if(value !== false) {
      const { qSuggests } = this.props;
      const result = qSuggests.find((item) => {return item.label === field})
      if (result) {
        this.setState({
          isInvalid: false,
          inputStage: 'values',
        });
      } else {
        this.setState({
          isInvalid: true,
          suggestions: [{
            type: { iconType: 'alert', color: 'tint2' },
            label: `The field ${field} no exists`,
          }]
        });
      }
    } else {
      this.setState({
        isInvalid: false,
        inputStage: 'fields',
      });
    }
  }

  renderFormatSelector() {
    const { qSuggests, apiSuggests } = this.props;
    const qFilterEnabled = qSuggests ? true : false;
    const apiFilterEnabled = apiSuggests ? true : false;
    if (!qFilterEnabled && !apiFilterEnabled) {
      return null;
    }
    return (<WzSearchFormatSelector 
      onChange={this.onChangeSearchFormat}
      qFilterEnabled={qFilterEnabled}
      apiFilterEnabled={apiFilterEnabled}
    />);
  }

  render() {
    const { status, suggestions, inputValue, isInvalid, filters } = this.state;
    const formatedFilter = [...Object.keys(filters).map((item) => {return {field: item, value: filters[item]}})];
    const searchFormatSelector = this.renderFormatSelector();
    return (
      <div>
        <EuiFlexGroup>
          <EuiFlexItem>
            <EuiSuggest
            status={status}
              value={inputValue}
              onKeyPress={this.onKeyPress}
              onItemClick={this.onItemClick.bind(this)}
              append={searchFormatSelector}
              suggestions={suggestions}
              onInputChange={this.onInputChange}
              isInvalid={isInvalid}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiFlexGroup>
          <EuiFlexItem grow={false}>
            <WzSearchBadges
              filters={formatedFilter}
              onChange={this.onDeleteBadge.bind(this)} />
          </EuiFlexItem>
        </EuiFlexGroup>
      </div>
    );
  }
}
